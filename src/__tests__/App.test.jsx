import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App.jsx';

const SUBJECTS_STORAGE_KEY = 'revision-platform.subjects.v1';

describe('Revision platform - étape 2 data coherence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => cleanup());

  it('starts with no hardcoded previous subjects and shows an empty state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /anciens sujets/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/aucun sujet pour le moment/i)).toBeInTheDocument();
    expect(screen.queryByText(/algorithmique/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bases de données/i)).not.toBeInTheDocument();
  });

  it('creates and persists a subject from one or several selected PDFs', async () => {
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

    const stored = JSON.parse(window.localStorage.getItem(SUBJECTS_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Sujet réseau et systèmes');
    expect(stored[0].documents).toEqual(['cours-reseau.pdf', 'annales-systemes.pdf']);
  });

  it('loads subjects from localStorage on startup', () => {
    window.localStorage.setItem(
      SUBJECTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 's1',
          title: 'Sujet persistant',
          documents: ['exercice1.pdf'],
          createdAt: '2026-04-27T11:00:00.000Z',
        },
      ]),
    );

    render(<App />);

    expect(screen.getByText(/sujet persistant/i)).toBeInTheDocument();
    expect(screen.getByText(/1 document/i)).toBeInTheDocument();
  });

  it('provides PDF multi-select, folder input, and drag-and-drop support', async () => {
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

  it('opens a floating detail window when clicking a previous subject with downloadable attachments', () => {
    window.localStorage.setItem(
      SUBJECTS_STORAGE_KEY,
      JSON.stringify([
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
          createdAt: '2026-04-27T11:00:00.000Z',
        },
      ]),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /ouvrir les détails de sujet réseaux avancé/i }));

    expect(screen.getByRole('dialog', { name: /détails du sujet/i })).toBeInTheDocument();
    expect(screen.getByText(/fichiers joints/i)).toBeInTheDocument();
    expect(screen.getByText(/date de création/i)).toBeInTheDocument();
    expect(screen.getByText(/nombre de documents/i)).toBeInTheDocument();
    expect(screen.getByText(/format principal/i)).toBeInTheDocument();

    const fileLink = screen.getByRole('link', { name: /annale-2025.pdf/i });
    expect(fileLink).toHaveAttribute('download', 'annale-2025.pdf');
    expect(fileLink.getAttribute('href')).toContain('data:application/pdf;base64,JVBERi0xLjQK');
  });

  it('stores real file payload and exposes a non-corrupted download link for newly created subjects', async () => {
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
