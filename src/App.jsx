import { ArrowUpRight, FileText, FolderOpen, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'revision-platform.subjects.v1';
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'odt']);

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
  if (typeof subject.id !== 'string' || typeof subject.title !== 'string' || typeof subject.createdAt !== 'string') {
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
    createdAt: subject.createdAt,
    documents: documentNames,
    attachments: mergedAttachments,
  };
};

const loadSubjects = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeSubject).filter(Boolean);
  } catch {
    return [];
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

export default function App() {
  const [subjects, setSubjects] = useState(() => loadSubjects());
  const [subjectTitle, setSubjectTitle] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [openedSubject, setOpenedSubject] = useState(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
  }, [subjects]);

  const selectedCountLabel = useMemo(
    () => `${documentCountLabel(selectedDocuments.length)} sélectionné${selectedDocuments.length > 1 ? 's' : ''}`,
    [selectedDocuments.length],
  );

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

  const handleCreateSubject = () => {
    const normalizedTitle = subjectTitle.trim();
    if (!normalizedTitle || !selectedDocuments.length) return;

    const nextSubject = createSubject(normalizedTitle, selectedDocuments);
    setSubjects((current) => [nextSubject, ...current]);
    setSubjectTitle('');
    setSelectedDocuments([]);
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
                  onClick={() => setOpenedSubject(subject)}
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
            className="floating-window"
            role="dialog"
            aria-modal="true"
            aria-label="Détails du sujet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="floating-header">
              <h3>Détails du sujet</h3>
              <button type="button" className="close-button" onClick={() => setOpenedSubject(null)}>
                Fermer
              </button>
            </div>

            <p className="floating-title">{openedSubject.title}</p>

            <div className="floating-info-grid">
              <p><strong>Date de création</strong><span>{formatDate(openedSubject.createdAt)}</span></p>
              <p><strong>Nombre de documents</strong><span>{documentCountLabel(openedSubject.documents.length)}</span></p>
              <p><strong>Format principal</strong><span>{primaryFormatFromDocuments(openedSubject.documents)}</span></p>
            </div>

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
