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

  it('creates and persists a subject from one or several selected PDFs', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/nom du sujet/i), {
      target: { value: 'Sujet réseau et systèmes' },
    });

    const fileInput = screen.getByLabelText(/sélectionner un ou plusieurs pdf/i, { selector: 'input' });
    const f1 = new File(['alpha'], 'cours-reseau.pdf', { type: 'application/pdf' });
    const f2 = new File(['beta'], 'annales-systemes.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [f1, f2] } });

    fireEvent.click(screen.getByRole('button', { name: /ajouter le sujet/i }));

    expect(screen.getByText(/sujet réseau et systèmes/i)).toBeInTheDocument();
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
});
