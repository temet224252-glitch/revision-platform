import { ArrowUpRight, FileText, FolderOpen, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'odt']);

const SUPABASE_URL = 'https://ssqqsjziknqhwdufgduv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcXFzanppa25xaHdkdWZnZHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTUzNTQsImV4cCI6MjA5Mjg3MTM1NH0.zMI-UBQDsYLCiSH6BDXt1BsCXpr5t5tO2PatcnIjBQs';
const SUPABASE_TABLE = 'revision_subjects';
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const SUPABASE_SELECT = 'id,title,created_at,documents,attachments';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

const documentCountLabel = (count) => `${count} document${count > 1 ? 's' : ''}`;

const extensionFromName = (name = '') => {
  if (typeof name !== 'string') return '';
  const chunks = name.toLowerCase().split('.');
  return chunks.length > 1 ? chunks.at(-1) : '';
};

const mimeFromExtension = (ext) => {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'md') return 'text/markdown';
  return 'application/octet-stream';
};

const primaryFormatFromDocuments = (documents = []) => {
  if (!documents.length) return 'Inconnu';
  const ext = extensionFromName(documents[0]);
  return ext ? ext.toUpperCase() : 'Inconnu';
};

const formatDate = (isoDate) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date inconnue';
  }
  return parsed.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const isSupportedDocument = (file) => {
  if (!file || !file.name) return false;

  const lowerName = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return true;
  }

  const extension = lowerName.split('.').pop();
  return SUPPORTED_EXTENSIONS.has(extension);
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
  reader.readAsDataURL(file);
});

const attachmentKey = (attachment) => `${attachment.name}::${attachment.size ?? 0}`;

const normalizeAttachment = (attachmentLike) => {
  if (!attachmentLike) return null;

  if (typeof attachmentLike === 'string') {
    const ext = extensionFromName(attachmentLike);
    return {
      name: attachmentLike,
      type: mimeFromExtension(ext),
      size: null,
      dataUrl: null,
    };
  }

  if (typeof attachmentLike === 'object' && typeof attachmentLike.name === 'string' && attachmentLike.name) {
    const ext = extensionFromName(attachmentLike.name);
    return {
      name: attachmentLike.name,
      type: typeof attachmentLike.type === 'string' && attachmentLike.type
        ? attachmentLike.type
        : mimeFromExtension(ext),
      size: typeof attachmentLike.size === 'number' ? attachmentLike.size : null,
      dataUrl: typeof attachmentLike.dataUrl === 'string' ? attachmentLike.dataUrl : null,
    };
  }

  return null;
};

const dedupeAttachments = (attachments = []) => {
  const byKey = new Map();

  attachments
    .map(normalizeAttachment)
    .filter(Boolean)
    .forEach((attachment) => {
      const key = attachmentKey(attachment);
      const existing = byKey.get(key);
      if (!existing || (!existing.dataUrl && attachment.dataUrl)) {
        byKey.set(key, attachment);
      }
    });

  return [...byKey.values()];
};

const createSubject = (title, attachments) => {
  const normalizedAttachments = dedupeAttachments(attachments);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    documents: normalizedAttachments.map((attachment) => attachment.name),
    attachments: normalizedAttachments,
    createdAt: new Date().toISOString(),
  };
};

const normalizeSubject = (subject) => {
  if (!subject || typeof subject !== 'object') return null;

  const createdAtCandidate = typeof subject.createdAt === 'string'
    ? subject.createdAt
    : (typeof subject.created_at === 'string' ? subject.created_at : null);

  if (typeof subject.id !== 'string' || typeof subject.title !== 'string' || !createdAtCandidate) {
    return null;
  }

  const rawDocuments = Array.isArray(subject.documents) ? subject.documents : [];
  const docsFromDocuments = dedupeAttachments(rawDocuments);
  const docsFromAttachments = dedupeAttachments(Array.isArray(subject.attachments) ? subject.attachments : []);
  const mergedAttachments = dedupeAttachments([...docsFromDocuments, ...docsFromAttachments]);
  const documentNames = [...new Set(mergedAttachments.map((attachment) => attachment.name))];

  return {
    id: subject.id,
    title: subject.title,
    createdAt: createdAtCandidate,
    documents: documentNames,
    attachments: mergedAttachments,
  };
};


const toRemoteSubject = (subject) => ({
  id: subject.id,
  title: subject.title,
  created_at: subject.createdAt,
  documents: subject.documents,
  attachments: subject.attachments,
});

const fetchRemoteSubjects = async () => {
  if (!SUPABASE_ENABLED) return [];

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=${encodeURIComponent(SUPABASE_SELECT)}&order=created_at.desc`,
    {
      method: 'GET',
      headers: SUPABASE_HEADERS,
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch remote subjects');
  }

  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map(normalizeSubject).filter(Boolean);
};

const pushRemoteSubject = async (subject) => {
  if (!SUPABASE_ENABLED) return;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
    method: 'POST',
    headers: {
      ...SUPABASE_HEADERS,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(toRemoteSubject(subject)),
  });

  if (!response.ok) {
    throw new Error('Failed to push remote subject');
  }
};

const deleteRemoteSubject = async (id) => {
  if (!SUPABASE_ENABLED) return;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: SUPABASE_HEADERS,
  });

  if (!response.ok) {
    throw new Error('Failed to delete remote subject');
  }
};

const readDirectoryEntries = async (reader) => {
  const collected = [];

  const loop = async () => {
    const chunk = await new Promise((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });

    if (!chunk.length) return;

    collected.push(...chunk);
    await loop();
  };

  await loop();
  return collected;
};

const filesFromEntry = async (entry) => {
  if (!entry) return [];

  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await readDirectoryEntries(reader);
    const nestedFiles = await Promise.all(entries.map((nestedEntry) => filesFromEntry(nestedEntry)));
    return nestedFiles.flat();
  }

  return [];
};

const extractDropFiles = async (dataTransfer) => {
  if (!dataTransfer) return [];

  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length) {
    const groups = await Promise.all(entries.map((entry) => filesFromEntry(entry)));
    return groups.flat();
  }

  return Array.from(dataTransfer.files ?? []);
};

const downloadHrefForAttachment = (attachment) => {
  if (attachment?.dataUrl) return attachment.dataUrl;

  const ext = extensionFromName(attachment?.name || '');
  const mime = attachment?.type || mimeFromExtension(ext);
  const payload = encodeURIComponent(`Document: ${attachment?.name || 'fichier'}`);
  return `data:${mime};charset=utf-8,${payload}`;
};

const buildStarterRevisionPath = (subject) => ({
  title: subject.title,
  status: 'Parcours visuel prêt',
  essentials: [
    'On part de zéro. Une idée par bloc.',
    'Formule ou règle centrale en premier. Exceptions après.',
    'Chaque notion doit être manipulée, pas seulement lue.',
  ],
  matches: [
    ['Hypoténuse', 'Côté le plus long, face à l’angle droit'],
    ['Carré', 'Aire construite sur un côté'],
    ['Validation', 'Retour immédiat vert ou rouge'],
  ],
});

export default function App() {
  const [subjects, setSubjects] = useState([]);
  const [subjectTitle, setSubjectTitle] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [openedSubject, setOpenedSubject] = useState(null);
  const [generatedPath, setGeneratedPath] = useState(null);
  const [pythagoreA, setPythagoreA] = useState(3);
  const [pythagoreB, setPythagoreB] = useState(4);
  const [matchFeedback, setMatchFeedback] = useState('');

  useEffect(() => {
    let canceled = false;

    const syncFromRemote = async () => {
      try {
        const remoteSubjects = await fetchRemoteSubjects();
        if (!canceled) {
          setSubjects(remoteSubjects);
        }
      } catch {
        if (!canceled) {
          setSubjects([]);
        }
      }
    };

    void syncFromRemote();

    return () => {
      canceled = true;
    };
  }, []);

  const selectedCountLabel = useMemo(
    () => `${documentCountLabel(selectedDocuments.length)} sélectionné${selectedDocuments.length > 1 ? 's' : ''}`,
    [selectedDocuments.length],
  );

  const pythagoreC = Math.sqrt((pythagoreA ** 2) + (pythagoreB ** 2)).toFixed(2);
  const pythagoreAreaC = ((pythagoreA ** 2) + (pythagoreB ** 2)).toFixed(0);

  const openSubjectWorkspace = (subject) => {
    setOpenedSubject(subject);
    setGeneratedPath(null);
    setMatchFeedback('');
    setPythagoreA(3);
    setPythagoreB(4);
  };

  const handleGenerateRevisionPath = () => {
    if (!openedSubject) return;
    setGeneratedPath(buildStarterRevisionPath(openedSubject));
  };

  const handleValidateMatching = () => {
    setMatchFeedback('Correct : les liens sont cohérents.');
  };

  const mergeSelectedDocuments = async (incomingFiles) => {
    const supportedFiles = Array.from(incomingFiles ?? []).filter(isSupportedDocument);
    if (!supportedFiles.length) return;

    const newAttachments = await Promise.all(
      supportedFiles.map(async (file) => ({
        name: file.name,
        type: file.type || mimeFromExtension(extensionFromName(file.name)),
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );

    setSelectedDocuments((current) => dedupeAttachments([...current, ...newAttachments]));
  };

  const handlePdfSelection = async (event) => {
    await mergeSelectedDocuments(event.target.files ?? []);
    event.target.value = '';
  };

  const handleFolderSelection = async (event) => {
    await mergeSelectedDocuments(event.target.files ?? []);
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragActive(false);

    const droppedFiles = await extractDropFiles(event.dataTransfer);
    await mergeSelectedDocuments(droppedFiles);
  };

  const handleCreateSubject = async () => {
    const normalizedTitle = subjectTitle.trim();
    if (!normalizedTitle || !selectedDocuments.length) return;

    const nextSubject = createSubject(normalizedTitle, selectedDocuments);

    try {
      await pushRemoteSubject(nextSubject);
      setSubjects((current) => [nextSubject, ...current]);
      setSubjectTitle('');
      setSelectedDocuments([]);
    } catch {
      // BD-only mode: no local persistence fallback.
    }
  };

  const handleDeleteOpenedSubject = async () => {
    if (!openedSubject) return;

    const idToDelete = openedSubject.id;

    try {
      await deleteRemoteSubject(idToDelete);
      setSubjects((current) => current.filter((subject) => subject.id !== idToDelete));
      setOpenedSubject(null);
    } catch {
      // BD-only mode: keep current UI state when remote deletion fails.
    }
  };


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
          Retrouve tes anciens sujets de révision et dépose un PDF ou un dossier pour créer un nouveau sujet.
          Clair, rapide, cohérent.
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

          {subjects.length === 0 ? (
            <div className="empty-state">
              <FileText size={20} aria-hidden="true" />
              <p>Aucun sujet pour le moment.</p>
              <p className="muted-copy">Ajoute un sujet depuis le panneau de droite.</p>
            </div>
          ) : (
            <div className="subject-list">
              {subjects.map((subject) => (
                <button
                  className="subject-card subject-card-button"
                  key={subject.id}
                  type="button"
                  aria-label={`Ouvrir les détails de ${subject.title}`}
                  onClick={() => openSubjectWorkspace(subject)}
                >
                  <div className="subject-icon" aria-hidden="true"><FileText size={18} /></div>
                  <div className="subject-main">
                    <p className="subject-meta">
                      {formatDate(subject.createdAt)} · {documentCountLabel(subject.documents.length)}
                    </p>
                    <h3>{subject.title}</h3>
                    <p className="subject-documents">{subject.documents.join(' · ')}</p>
                  </div>
                  <ArrowUpRight className="subject-arrow" size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section id="nouveau-sujet" className="panel upload-panel" aria-labelledby="upload-title">
          <div className="section-heading">
            <p className="eyebrow muted">Import</p>
            <h2 id="upload-title">Nouveau sujet</h2>
          </div>

          <form className="upload-box" onSubmit={(event) => event.preventDefault()}>
            <UploadCloud size={34} aria-hidden="true" />

            <div className="field-group">
              <label htmlFor="subject-title">Nom du sujet</label>
              <input
                id="subject-title"
                name="subjectTitle"
                type="text"
                placeholder="Ex: Réseaux et systèmes"
                value={subjectTitle}
                onChange={(event) => setSubjectTitle(event.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="pdf-upload">Sélectionner un ou plusieurs PDF</label>
              <input
                id="pdf-upload"
                name="pdf"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={handlePdfSelection}
              />
            </div>

            <div className="field-group">
              <label htmlFor="folder-upload">Sélectionner un dossier</label>
              <input
                id="folder-upload"
                name="folder"
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                onChange={handleFolderSelection}
              />
            </div>

            <div
              data-testid="dropzone"
              className={`dropzone ${dragActive ? 'is-active' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <FolderOpen size={18} aria-hidden="true" />
              <p>Glisse-dépose ici un ou plusieurs PDF, ou un dossier.</p>
            </div>

            <p className="selection-status">
              {selectedDocuments.length ? selectedCountLabel : 'Aucun document sélectionné'}
            </p>

            <button
              className="button primary wide"
              type="button"
              onClick={handleCreateSubject}
              disabled={!subjectTitle.trim() || !selectedDocuments.length}
            >
              Ajouter le sujet
            </button>
          </form>
        </section>
      </section>

      {openedSubject && (
        <div className="floating-overlay" role="presentation" onClick={() => setOpenedSubject(null)}>
          <section
            className="floating-window study-window"
            role="dialog"
            aria-modal="true"
            aria-label="Détails du sujet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="floating-header">
              <div>
                <p className="eyebrow muted">Texte clair + jeux visuels</p>
                <h3>Atelier de révision</h3>
              </div>
              <div className="floating-header-actions">
                <button type="button" className="delete-button" onClick={handleDeleteOpenedSubject}>
                  Supprimer ce sujet
                </button>
                <button type="button" className="close-button" onClick={() => setOpenedSubject(null)}>
                  Fermer
                </button>
              </div>
            </div>

            <p className="floating-title">{openedSubject.title}</p>

            <div className="floating-info-grid">
              <p><strong>Date de création</strong><span>{formatDate(openedSubject.createdAt)}</span></p>
              <p><strong>Nombre de documents</strong><span>{documentCountLabel(openedSubject.documents.length)}</span></p>
              <p><strong>Format principal</strong><span>{primaryFormatFromDocuments(openedSubject.documents)}</span></p>
            </div>

            <div className="study-intro">
              <div>
                <p className="attachment-title">Génération IA prévue</p>
                <p>Première brique : produire un parcours lisible, visuel, rejouable, avec interactions adaptées au sujet.</p>
              </div>
              <button type="button" className="button primary" onClick={handleGenerateRevisionPath}>
                Générer le parcours interactif
              </button>
            </div>

            {generatedPath && (
              <div className="study-path" aria-label="Parcours de révision généré">
                <p className="generation-status">{generatedPath.status}</p>

                <section className="lesson-card">
                  <p className="eyebrow muted">Cours</p>
                  <h3>Comprendre sans blabla</h3>
                  <p>
                    On garde uniquement ce qui aide à résoudre. La règle principale vient d’abord,
                    puis une image mentale, puis une manipulation.
                  </p>
                  <ul className="key-list">
                    {generatedPath.essentials.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>

                <section className="interactive-card">
                  <div>
                    <p className="eyebrow muted">Simulateur visuel</p>
                    <h3>Pythagore manipulable</h3>
                    <p>Change les côtés. Les carrés suivent. L’hypoténuse se recalcule.</p>
                  </div>
                  <div className="pythagore-lab">
                    <div className="triangle-stage" aria-label="animation pythagore">
                      <div className="square square-a" style={{ width: `${pythagoreA * 12}px`, height: `${pythagoreA * 12}px` }}>a²</div>
                      <div className="triangle-shape" />
                      <div className="square square-b" style={{ width: `${pythagoreB * 12}px`, height: `${pythagoreB * 12}px` }}>b²</div>
                      <div className="square square-c">c² = {pythagoreAreaC}</div>
                    </div>
                    <label>
                      Côté A
                      <input aria-label="Côté A" type="range" min="1" max="8" value={pythagoreA} onChange={(event) => setPythagoreA(Number(event.target.value))} />
                    </label>
                    <label>
                      Côté B
                      <input aria-label="Côté B" type="range" min="1" max="8" value={pythagoreB} onChange={(event) => setPythagoreB(Number(event.target.value))} />
                    </label>
                    <p className="formula-chip">c = √({pythagoreA}² + {pythagoreB}²) = {pythagoreC}</p>
                  </div>
                </section>

                <section className="interactive-card">
                  <p className="eyebrow muted">Mini-jeu de matching</p>
                  <h3>Associe les idées</h3>
                  <div className="match-grid">
                    {generatedPath.matches.map(([term, definition]) => (
                      <div className="match-row" key={term}>
                        <span>{term}</span>
                        <span>{definition}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="button secondary" onClick={handleValidateMatching}>
                    Valider les associations
                  </button>
                  {matchFeedback && <p className="match-feedback">{matchFeedback}</p>}
                </section>
              </div>
            )}

            <div className="attachment-panel">
              <p className="attachment-title">Fichiers joints</p>
              <ul>
                {openedSubject.attachments.map((attachment) => (
                  <li key={attachmentKey(attachment)}>
                    <a href={downloadHrefForAttachment(attachment)} download={attachment.name}>{attachment.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
