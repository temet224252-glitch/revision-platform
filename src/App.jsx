import { ArrowUpRight, FileText, UploadCloud } from 'lucide-react';

const previousSubjects = [
  {
    title: 'Algorithmique',
    meta: 'Sujet blanc · 2025',
    description: 'Complexité, tableaux, boucles et raisonnement pas à pas.',
  },
  {
    title: 'Bases de données',
    meta: 'Révision SQL · 2025',
    description: 'Modèle relationnel, requêtes SELECT, jointures et contraintes.',
  },
  {
    title: 'Développement objet',
    meta: 'Entraînement · 2024',
    description: 'Classes, encapsulation, héritage et lecture de code Java.',
  },
];

export default function App() {
  return (
    <main className="shell">
      <nav className="nav" aria-label="Navigation principale">
        <a className="brand" href="#top" aria-label="Accueil Révisions">
          <span className="brand-mark">R</span>
          <span>Révisions</span>
        </a>
        <div className="nav-links">
          <a href="#anciens-sujets">Anciens sujets</a>
          <a href="#nouveau-sujet">Nouveau sujet</a>
        </div>
      </nav>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Plateforme de révision</p>
        <h1 id="hero-title">Plateforme de révision</h1>
        <p className="hero-copy">
          Retrouve tes anciens sujets de révision et dépose un PDF pour préparer un nouveau sujet.
          Rien de plus. Clair, rapide, propre.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="#nouveau-sujet">Créer un nouveau sujet</a>
          <a className="button secondary" href="#anciens-sujets">Voir les anciens sujets</a>
        </div>
      </section>

      <section className="content-grid" aria-label="Fonctions disponibles">
        <section id="anciens-sujets" className="panel subjects-panel" aria-labelledby="subjects-title">
          <div className="section-heading">
            <p className="eyebrow muted">Bibliothèque</p>
            <h2 id="subjects-title">Anciens sujets</h2>
          </div>
          <div className="subject-list">
            {previousSubjects.map((subject) => (
              <article className="subject-card" key={subject.title}>
                <div className="subject-icon" aria-hidden="true"><FileText size={18} /></div>
                <div>
                  <p className="subject-meta">{subject.meta}</p>
                  <h3>{subject.title}</h3>
                  <p>{subject.description}</p>
                </div>
                <ArrowUpRight className="subject-arrow" size={17} aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section id="nouveau-sujet" className="panel upload-panel" aria-labelledby="upload-title">
          <div className="section-heading">
            <p className="eyebrow muted">Import</p>
            <h2 id="upload-title">Déposer un PDF</h2>
          </div>
          <form className="upload-box">
            <UploadCloud size={34} aria-hidden="true" />
            <label htmlFor="pdf-upload">Déposer un PDF</label>
            <p>Glisse un fichier ici ou sélectionne un document depuis ton appareil.</p>
            <input id="pdf-upload" name="pdf" type="file" accept="application/pdf,.pdf" />
            <button className="button primary wide" type="button">Créer un nouveau sujet</button>
          </form>
        </section>
      </section>
    </main>
  );
}
