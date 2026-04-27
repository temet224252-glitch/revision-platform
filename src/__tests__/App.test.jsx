import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../App.jsx';

describe('Revision platform landing page', () => {
  afterEach(() => cleanup());

  it('shows the landing headline and minimal product promise', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /plateforme de révision/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir les anciens sujets/i })).toBeInTheDocument();
    expect(screen.getByText(/dépose un pdf pour préparer/i)).toBeInTheDocument();
  });

  it('lists previous revision subjects', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /anciens sujets/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/algorithmique/i)).toBeInTheDocument();
    expect(screen.getByText(/bases de données/i)).toBeInTheDocument();
  });

  it('provides a PDF upload entry point for creating a new subject', () => {
    render(<App />);

    const input = screen.getByLabelText(/déposer un pdf/i, { selector: 'input' });
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf');
    expect(screen.getByRole('button', { name: /créer un nouveau sujet/i })).toBeInTheDocument();
  });
});
