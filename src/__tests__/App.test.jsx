import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';

const originalFetch = global.fetch;

describe('Revision platform - étape 2 data coherence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts with no hardcoded previous subjects and shows an empty state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /anciens sujets/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/aucun sujet pour le moment/i)).toBeInTheDocument();
    expect(screen.queryByText(/algorithmique/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bases de données/i)).not.toBeInTheDocument();
  });

  it('uses Supabase as the only persistence source (no localStorage read/write)', async () => {
    window.localStorage.setItem(
      'revision-platform.subjects.v1',
      JSON.stringify([
        {
          id: 'local-only',
          title: 'Sujet local fantôme',
          documents: ['ghost.pdf'],
          createdAt: '2026-04-27T11:00:00.000Z',
        },
      ]),
    );

    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    render(<App />);

    expect(await screen.findByText(/aucun sujet pour le moment/i)).toBeInTheDocument();
    expect(screen.queryByText(/sujet local fantôme/i)).not.toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('creates a subject through Supabase and shows it in the UI', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Sujet réseau et systèmes' },
    });

    const fileInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    const f1 = new File(['alpha'], 'cours-reseau.pdf', { type: 'application/pdf' });
    const f2 = new File(['beta'], 'annales-systemes.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [f1, f2] } });

    await screen.findByText(/2 documents sélectionnés/i);
    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    expect(await screen.findByText(/sujet réseau et systèmes/i)).toBeInTheDocument();
    expect(screen.getByText(/2 documents/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/revision_subjects'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('keeps UI unchanged when create API call fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Sujet non persisté' },
    });

    const fileInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    const file = new File(['beta'], 'fail.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByText(/1 document sélectionné/i);
    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/revision_subjects'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(screen.queryByText(/sujet non persisté/i)).not.toBeInTheDocument();
    expect(screen.getByText(/aucun sujet pour le moment/i)).toBeInTheDocument();
  });

  it('loads remote subjects from Supabase when API is available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 'remote-1',
          title: 'Sujet distant',
          created_at: '2026-04-27T12:00:00.000Z',
          documents: ['dist.pdf'],
          attachments: [{ name: 'dist.pdf', type: 'application/pdf', size: 500, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }],
        },
      ]),
    });

    render(<App />);

    expect(await screen.findByText(/sujet distant/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/revision_subjects?select='),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  it('provides PDF multi-select, folder input, and drag-and-drop support', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    render(<App />);

    const pdfInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    expect(pdfInput).toHaveAttribute('type', 'file');
    expect(pdfInput).toHaveAttribute('multiple');
    expect(pdfInput).toHaveAttribute('accept', 'application/pdf,.pdf');

    const folderInput = screen.getByLabelText(/sélectionner un dossier/i, { selector: 'input' });
    expect(folderInput).toHaveAttribute('type', 'file');
    expect(folderInput).toHaveAttribute('multiple');
    expect(folderInput).toHaveAttribute('webkitdirectory');

    const dropzone = screen.getByTestId('dropzone');
    const droppedPdf = new File(['gamma'], 'drop.pdf', { type: 'application/pdf' });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [droppedPdf],
        items: [],
      },
    });

    expect(await screen.findByText(/1 document sélectionné/i)).toBeInTheDocument();
  });

  it('opens a floating detail window when clicking a previous subject with downloadable attachments', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 's2',
          title: 'Sujet Réseaux avancé',
          documents: [
            {
              name: 'annale-2025.pdf',
              type: 'application/pdf',
              size: 1024,
              dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
            },
            {
              name: 'slides-tcpip.pdf',
              type: 'application/pdf',
              size: 2048,
              dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
            },
          ],
          created_at: '2026-04-27T11:00:00.000Z',
        },
      ]),
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de sujet réseaux avancé/i }));

    expect(screen.getByRole('dialog', { name: /détails du sujet/i })).toBeInTheDocument();
    expect(screen.getByText(/fichiers joints/i)).toBeInTheDocument();
    expect(screen.getByText(/date de création/i)).toBeInTheDocument();
    expect(screen.getByText(/nombre de documents/i)).toBeInTheDocument();
    expect(screen.getByText(/format principal/i)).toBeInTheDocument();

    const fileLink = screen.getByRole('link', { name: /annale-2025.pdf/i });
    expect(fileLink).toHaveAttribute('download', 'annale-2025.pdf');
    expect(fileLink.getAttribute('href')).toContain('data:application/pdf;base64,JVBERi0xLjQK');
  });

  it('deletes a subject from Supabase and UI from the floating detail window', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            id: 's-delete',
            title: 'Sujet à supprimer',
            documents: ['annale.pdf'],
            attachments: [
              {
                name: 'annale.pdf',
                type: 'application/pdf',
                size: 1024,
                dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
              },
            ],
            created_at: '2026-04-27T11:00:00.000Z',
          },
        ]),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de sujet à supprimer/i }));
    fireEvent.click(screen.getByRole('button', { name: /supprimer ce sujet/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/revision_subjects?id=eq.'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    expect(screen.queryByRole('dialog', { name: /détails du sujet/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/sujet à supprimer/i)).not.toBeInTheDocument();
    expect(screen.getByText(/aucun sujet pour le moment/i)).toBeInTheDocument();
  });

  it('opens a full-page revision course without hardcoded Pythagore for another subject', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 'network-1',
          title: 'Réseaux et routage',
          created_at: '2026-04-27T12:00:00.000Z',
          documents: ['routage-ip.pdf'],
          attachments: [{ name: 'routage-ip.pdf', type: 'application/pdf', size: 500, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }],
        },
      ]),
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de réseaux et routage/i }));

    expect(screen.getByRole('main', { name: /parcours de révision/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /réseaux et routage/i, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/parcours prêt/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /lancer le parcours/i })).toBeInTheDocument();
    expect(screen.queryByText(/pythagore/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /lancer le parcours/i }));

    expect(await screen.findByRole('heading', { name: /cours visuel/i })).toBeInTheDocument();
    expect(screen.getAllByText(/routage-ip\.pdf/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/atelier interactif/i)).toBeInTheDocument();
    expect(screen.getAllByText(/réseaux et routage/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /valider l'activité/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/côté a/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/côté b/i)).not.toBeInTheDocument();
  });

  it('auto-prepares a revision path after creating a subject from uploaded PDFs', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Graphes complets' },
    });

    const pdfInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    fireEvent.change(pdfInput, { target: { files: [new File(['graphes'], 'cours-graphes.pdf', { type: 'application/pdf' })] } });

    await screen.findByText(/1 document sélectionné/i);
    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    expect(await screen.findByText(/parcours prêt/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ouvrir les détails de graphes complets/i }));
    expect(screen.getByRole('main', { name: /parcours de révision/i })).toBeInTheDocument();
  });

  it('builds the revision course from extracted PDF text instead of only the file title', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Réseaux' },
    });

    const pdfInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    const courseText = [
      'Cours R2.05 Services Réseaux.',
      'Une adresse IPv4 identifie une interface réseau sur 32 bits.',
      'Le DNS traduit un nom de domaine en adresse IP utilisable.',
      'Le protocole DHCP attribue automatiquement une configuration réseau.',
    ].join('\n');
    fireEvent.change(pdfInput, {
      target: { files: [new File([courseText], 'R2.05-ServicesReseaux-2025_2026-Cours_1.pdf', { type: 'application/pdf' })] },
    });

    await screen.findByText(/1 document sélectionné/i);
    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de réseaux/i }));
    fireEvent.click(screen.getByRole('button', { name: /lancer le parcours/i }));

    expect((await screen.findAllByText(/une adresse ipv4 identifie une interface réseau sur 32 bits/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/le dns traduit un nom de domaine en adresse ip utilisable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/le protocole dhcp attribue automatiquement une configuration réseau/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/base du cours généré/i)).not.toBeInTheDocument();
  });

  it('extracts course text from stored attachment payloads when an older subject has no contentText yet', async () => {
    const storedText = 'Le routage IP choisit un chemin entre deux réseaux. Un routeur utilise sa table de routage pour sélectionner le prochain saut.';
    const encoded = btoa(unescape(encodeURIComponent(storedText)));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 'legacy-network',
          title: 'Ancien sujet réseau',
          created_at: '2026-04-27T12:00:00.000Z',
          documents: ['ancien-routage.pdf'],
          attachments: [{ name: 'ancien-routage.pdf', type: 'application/pdf', size: 500, dataUrl: `data:application/pdf;base64,${encoded}` }],
        },
      ]),
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de ancien sujet réseau/i }));
    fireEvent.click(await screen.findByRole('button', { name: /lancer le parcours/i }));

    expect((await screen.findAllByText(/le routage ip choisit un chemin entre deux réseaux/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/un routeur utilise sa table de routage pour sélectionner le prochain saut/i).length).toBeGreaterThan(0);
  });

  it('stores real file payload and exposes a non-corrupted download link for newly created subjects', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Sujet PDF réel' },
    });

    const pdfInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    const pdfContent = '%PDF-1.4\nmini test content';
    const file = new File([pdfContent], 'real-file.pdf', { type: 'application/pdf' });
    fireEvent.change(pdfInput, { target: { files: [file] } });

    await screen.findByText(/1 document sélectionné/i);
    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir les détails de sujet pdf réel/i }));

    const link = screen.getByRole('link', { name: /real-file.pdf/i });
    const href = link.getAttribute('href') || '';

    expect(href.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(href).toContain('JVBERi0xLjQK');
  });
});
