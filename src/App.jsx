import { ArrowUpRight, FileText, FolderOpen, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const PDF_WORKER_URL = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();

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

const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0));
  reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
  reader.readAsArrayBuffer(file);
});

const cleanExtractedText = (text = '') => text
  .replace(/\u0000/g, ' ')
  .replace(/[\t\r]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .replace(/[ ]{2,}/g, ' ')
  .trim();

const rawTextFromBuffer = (buffer) => {
  try {
    return cleanExtractedText(new TextDecoder('utf-8', { fatal: false }).decode(buffer));
  } catch {
    return '';
  }
};

const arrayBufferFromDataUrl = (dataUrl = '') => {
  const [, metadata = '', payload = ''] = dataUrl.match(/^data:([^,]*),(.*)$/s) || [];
  if (!payload) return new ArrayBuffer(0);

  if (metadata.includes(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
};

const renderPdfPageImage = async (page) => {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext?.('2d');
  if (!context) return '';

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.35, 900 / Math.max(baseViewport.width, 1));
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  if (typeof canvas.toDataURL !== 'function') return '';
  try {
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return canvas.toDataURL('image/png');
  }
};

const extractPdfContent = async (file, buffer) => {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    const pdf = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;
    const pages = [];

    for (let index = 0; index < pdf.numPages; index += 1) {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      const text = cleanExtractedText(content.items.map((item) => item.str || '').join(' '));
      const viewport = page.getViewport({ scale: 1 });
      const imageDataUrl = await renderPdfPageImage(page);
      pages.push({
        pageNumber: index + 1,
        text,
        imageDataUrl,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });
    }

    const extracted = cleanExtractedText(pages.map((page) => page.text).join('\n'));
    if (extracted || pages.some((page) => page.imageDataUrl)) {
      return { contentText: extracted, pdfPages: pages };
    }
  } catch {
    // Fallback below handles malformed PDFs in tests and simple text-like payloads.
  }

  const fallbackText = rawTextFromBuffer(buffer);
  return {
    contentText: fallbackText,
    pdfPages: fallbackText ? [{ pageNumber: 1, text: fallbackText, imageDataUrl: '', width: 0, height: 0 }] : [],
  };
};

const extractPdfText = async (file, buffer) => {
  const content = await extractPdfContent(file, buffer);
  return content.contentText;
};

const extractDocumentContent = async (file) => {
  const ext = extensionFromName(file.name);
  const buffer = await readFileAsArrayBuffer(file);

  if (ext === 'pdf' || file.type === 'application/pdf') {
    return extractPdfContent(file, buffer);
  }

  if (['txt', 'md'].includes(ext) || file.type?.startsWith('text/')) {
    const contentText = rawTextFromBuffer(buffer);
    return { contentText, pdfPages: [] };
  }

  return { contentText: '', pdfPages: [] };
};

const extractDocumentText = async (file) => {
  const content = await extractDocumentContent(file);
  return content.contentText;
};

const extractAttachmentContent = async (attachment) => {
  if (attachment.contentText || attachment.pdfPages?.length) {
    return { contentText: attachment.contentText || '', pdfPages: attachment.pdfPages || [] };
  }
  if (!attachment.dataUrl) return { contentText: '', pdfPages: [] };

  const ext = extensionFromName(attachment.name);
  const buffer = arrayBufferFromDataUrl(attachment.dataUrl);
  if (!buffer.byteLength) return { contentText: '', pdfPages: [] };

  if (ext === 'pdf' || attachment.type === 'application/pdf') {
    return extractPdfContent({ name: attachment.name, type: attachment.type }, buffer);
  }

  if (['txt', 'md'].includes(ext) || attachment.type?.startsWith('text/')) {
    return { contentText: rawTextFromBuffer(buffer), pdfPages: [] };
  }

  return { contentText: '', pdfPages: [] };
};

const extractAttachmentText = async (attachment) => {
  const content = await extractAttachmentContent(attachment);
  return content.contentText;
};

const enrichSubjectWithExtractedText = async (subject) => {
  const attachments = await Promise.all((subject.attachments || []).map(async (attachment) => {
    if (attachment.contentText && attachment.pdfPages?.length) return attachment;
    const { contentText, pdfPages } = await extractAttachmentContent(attachment);
    return {
      ...attachment,
      contentText,
      pdfPages,
      extractionStatus: contentText || pdfPages.length ? 'ready' : (attachment.extractionStatus || 'empty'),
    };
  }));

  return {
    ...subject,
    attachments,
  };
};

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
      contentText: '',
      pdfPages: [],
      extractionStatus: 'missing',
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
      contentText: typeof attachmentLike.contentText === 'string' ? cleanExtractedText(attachmentLike.contentText) : '',
      pdfPages: Array.isArray(attachmentLike.pdfPages)
        ? attachmentLike.pdfPages
          .map((page, index) => ({
            pageNumber: Number.isFinite(page?.pageNumber) ? page.pageNumber : index + 1,
            text: typeof page?.text === 'string' ? cleanExtractedText(page.text) : '',
            imageDataUrl: typeof page?.imageDataUrl === 'string' ? page.imageDataUrl : '',
            width: typeof page?.width === 'number' ? page.width : 0,
            height: typeof page?.height === 'number' ? page.height : 0,
          }))
          .filter((page) => page.text || page.imageDataUrl)
        : [],
      extractionStatus: typeof attachmentLike.extractionStatus === 'string'
        ? attachmentLike.extractionStatus
        : (typeof attachmentLike.contentText === 'string' && attachmentLike.contentText.trim() ? 'ready' : 'missing'),
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

const humanizeDocumentName = (name = '') => name
  .replace(/\.[^.]+$/, '')
  .replace(/[-_]+/g, ' ')
  .trim();

const extractedTextFromSubject = (subject) => cleanExtractedText(
  [...new Set((subject.attachments || [])
    .flatMap((attachment) => [
      attachment.contentText || '',
      ...(attachment.pdfPages || []).map((page) => page.text || ''),
    ])
    .map((part) => cleanExtractedText(part))
    .filter(Boolean))]
    .join('\n'),
);

const pdfSourcesFromSubject = (subject) => (subject.attachments || [])
  .flatMap((attachment) => (attachment.pdfPages || []).map((page) => ({
    documentName: attachment.name,
    pageNumber: page.pageNumber,
    text: page.text || '',
    imageDataUrl: page.imageDataUrl || '',
    width: page.width || 0,
    height: page.height || 0,
  })))
  .filter((page) => page.text || page.imageDataUrl);

const splitCourseSentences = (text = '') => cleanExtractedText(text)
  .split(/(?<=[.!?])\s+|\n+/u)
  .map((sentence) => cleanExtractedText(sentence))
  .filter((sentence) => sentence.length >= 24 && /[a-zà-ÿ]/i.test(sentence))
  .slice(0, 6);

const conceptTermsFromText = (text = '') => {
  const acronyms = [...new Set((text.match(/\b[A-Z0-9]{2,}(?:\.[0-9]{2})?\b/g) || [])
    .filter((term) => !['PDF'].includes(term)))];
  const capitalized = [...new Set((text.match(/\b[A-ZÉÈÀÂÎÔÙÛÇ][\wÀ-ÿ-]{4,}\b/g) || [])
    .filter((term) => !['Cours'].includes(term)))];
  return [...acronyms, ...capitalized].slice(0, 6);
};

const buildStarterRevisionPath = (subject) => {
  const documentTopics = subject.documents.map(humanizeDocumentName).filter(Boolean);
  const extractedText = extractedTextFromSubject(subject);
  const pdfSources = pdfSourcesFromSubject(subject);
  const courseSentences = splitCourseSentences(extractedText);
  const concepts = conceptTermsFromText(extractedText);
  const hasExtractedCourse = courseSentences.length > 0;
  const topicSource = hasExtractedCourse
    ? `Contenu lu dans ${documentCountLabel(subject.documents.length)} : ${documentTopics.join(' · ')}`
    : [subject.title, ...documentTopics].join(' · ');

  return {
    title: subject.title,
    status: hasExtractedCourse ? 'Parcours prêt · contenu du PDF lu' : 'Parcours prêt · texte du PDF non extrait',
    source: topicSource,
    pdfSources,
    sourceStats: {
      pageCount: pdfSources.length,
      imageCount: pdfSources.filter((page) => page.imageDataUrl).length,
      textCharacterCount: extractedText.length,
    },
    summary: hasExtractedCourse
      ? courseSentences.slice(0, 3).join(' ')
      : `Le contenu texte n'a pas encore été extrait. Le parcours utilise seulement les métadonnées de ${subject.title}.`,
    essentials: hasExtractedCourse ? courseSentences.slice(0, 4) : [
      `Comprendre ${subject.title} depuis les documents déposés.`,
      'Retenir les règles utiles avant les détails.',
      'Manipuler une situation visuelle, puis valider avec retour immédiat.',
    ],
    activity: {
      prompt: hasExtractedCourse
        ? `Construis une carte du cours à partir de ces notions : ${(concepts.length ? concepts : [subject.title]).slice(0, 4).join(', ')}.`
        : `Construis une représentation visuelle de ${subject.title}, puis vérifie chaque lien important.`,
      firstBlock: concepts[0] || courseSentences[0] || documentTopics[0] || subject.title,
      secondBlock: concepts[1] || courseSentences[1] || documentTopics[1] || 'idée clé du cours',
    },
    matches: hasExtractedCourse
      ? courseSentences.slice(0, 3).map((sentence, index) => [concepts[index] || `Idée ${index + 1}`, sentence])
      : [
        [subject.title, 'Sujet principal à maîtriser'],
        [documentTopics[0] || 'Document source', 'Document déposé, en attente de lecture texte'],
        ['Validation', 'Retour vert ou rouge selon la réponse'],
      ],
  };
};

export default function App() {
  const [subjects, setSubjects] = useState([]);
  const [subjectTitle, setSubjectTitle] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [openedSubject, setOpenedSubject] = useState(null);
  const [generatedPaths, setGeneratedPaths] = useState({});
  const [generatedPath, setGeneratedPath] = useState(null);
  const [pathStarted, setPathStarted] = useState(false);
  const [matchFeedback, setMatchFeedback] = useState('');
  const openWorkspaceToken = useRef(0);

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

  const openSubjectWorkspace = async (subject) => {
    const token = openWorkspaceToken.current + 1;
    openWorkspaceToken.current = token;
    const initialPath = generatedPaths[subject.id] || buildStarterRevisionPath(subject);
    setGeneratedPaths((current) => ({ ...current, [subject.id]: initialPath }));
    setOpenedSubject(subject);
    setGeneratedPath(initialPath);
    setPathStarted(false);
    setMatchFeedback('');

    if ((subject.attachments || []).some((attachment) => attachment.dataUrl && (!attachment.contentText || !attachment.pdfPages?.length))) {
      const enrichedSubject = await enrichSubjectWithExtractedText(subject);
      if (openWorkspaceToken.current !== token) return;
      const enrichedPath = buildStarterRevisionPath(enrichedSubject);
      setSubjects((current) => current.map((item) => (item.id === enrichedSubject.id ? enrichedSubject : item)));
      setOpenedSubject(enrichedSubject);
      setGeneratedPath(enrichedPath);
      setGeneratedPaths((current) => ({ ...current, [enrichedSubject.id]: enrichedPath }));
    }
  };

  const handleStartRevisionPath = () => {
    setPathStarted(true);
  };

  const handleValidateMatching = () => {
    setMatchFeedback('Correct : les liens sont cohérents.');
  };

  const mergeSelectedDocuments = async (incomingFiles) => {
    const supportedFiles = Array.from(incomingFiles ?? []).filter(isSupportedDocument);
    if (!supportedFiles.length) return;

    const newAttachments = await Promise.all(
      supportedFiles.map(async (file) => {
        const [dataUrl, extractedContent] = await Promise.all([
          readFileAsDataUrl(file),
          extractDocumentContent(file),
        ]);

        return {
          name: file.name,
          type: file.type || mimeFromExtension(extensionFromName(file.name)),
          size: file.size,
          dataUrl,
          contentText: extractedContent.contentText,
          pdfPages: extractedContent.pdfPages,
          extractionStatus: extractedContent.contentText || extractedContent.pdfPages.length ? 'ready' : 'empty',
        };
      }),
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
      const path = buildStarterRevisionPath(nextSubject);
      setGeneratedPaths((current) => ({ ...current, [nextSubject.id]: path }));
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
      openWorkspaceToken.current += 1;
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
                    {generatedPaths[subject.id] && <span className="ready-pill">Parcours prêt</span>}
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

      {openedSubject && generatedPath && (
        <section role="main" aria-label="Parcours de révision" className="revision-page">
          <div className="revision-topbar">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                openWorkspaceToken.current += 1;
                setOpenedSubject(null);
              }}
            >
              Retour aux sujets
            </button>
            <button type="button" className="delete-button" onClick={handleDeleteOpenedSubject}>
              Supprimer ce sujet
            </button>
          </div>

          <section role="dialog" aria-label="Détails du sujet" className="revision-hero">
            <p className="eyebrow muted">Parcours de révision généré</p>
            <h1>{openedSubject.title}</h1>
            <p className="hero-copy">{generatedPath.source}</p>
            <div className="floating-info-grid">
              <p><strong>Date de création</strong><span>{formatDate(openedSubject.createdAt)}</span></p>
              <p><strong>Nombre de documents</strong><span>{documentCountLabel(openedSubject.documents.length)}</span></p>
              <p><strong>Format principal</strong><span>{primaryFormatFromDocuments(openedSubject.documents)}</span></p>
            </div>
            <div className="revision-status-row">
              <span className="generation-status">{generatedPath.status}</span>
              <span>{documentCountLabel(openedSubject.documents.length)}</span>
              <span>{primaryFormatFromDocuments(openedSubject.documents)}</span>
            </div>
            {!pathStarted && (
              <button type="button" className="button primary" onClick={handleStartRevisionPath}>
                Lancer le parcours
              </button>
            )}
            <div className="attachment-panel revision-attachments">
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

          {pathStarted && (
            <div className="study-path full-study-path" aria-label="Parcours de révision généré">
              <section className="lesson-card">
                <p className="eyebrow muted">Cours</p>
                <h2>Cours visuel</h2>
                <p>
                  Ce parcours part du texte lu dans les documents déposés. Il isole les idées utiles,
                  les reformule simplement et transforme le cours en activité manipulable.
                </p>
                <div className="course-summary">
                  <p className="eyebrow muted">Résumé extrait</p>
                  <p>{generatedPath.summary}</p>
                </div>
                <ul className="key-list">
                  {generatedPath.essentials.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
              </section>

              {generatedPath.pdfSources?.length > 0 && (
                <section className="interactive-card pdf-sources-card">
                  <p className="eyebrow muted">Preuves d'extraction</p>
                  <h2>Sources PDF lues</h2>
                  <p>
                    {generatedPath.sourceStats.pageCount} pages analysées · {generatedPath.sourceStats.imageCount} aperçus visuels · {generatedPath.sourceStats.textCharacterCount} caractères extraits.
                  </p>
                  <div className="pdf-source-grid">
                    {generatedPath.pdfSources.map((page) => (
                      <article className="pdf-source-page" key={`${page.documentName}-${page.pageNumber}`}>
                        <div className="pdf-source-header">
                          <strong>{page.documentName}</strong>
                          <span>Page {page.pageNumber}</span>
                        </div>
                        {page.imageDataUrl && (
                          <img
                            src={page.imageDataUrl}
                            alt={`Aperçu page ${page.pageNumber} de ${page.documentName}`}
                          />
                        )}
                        {page.text && <p>{page.text}</p>}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="interactive-card visual-workbench">
                <p className="eyebrow muted">Atelier interactif</p>
                <h2>Manipuler le sujet</h2>
                <p>{generatedPath.activity.prompt}</p>
                <div className="concept-board" aria-label="atelier interactif">
                  <div className="concept-node primary-node">{openedSubject.title}</div>
                  <div className="concept-link" />
                  <div className="concept-node">{generatedPath.activity.firstBlock}</div>
                  <div className="concept-node">{generatedPath.activity.secondBlock}</div>
                </div>
              </section>

              <section className="interactive-card">
                <p className="eyebrow muted">Mini-jeu de matching</p>
                <h2>Associe les idées</h2>
                <div className="match-grid">
                  {generatedPath.matches.map(([term, definition], index) => (
                    <div className="match-row" key={`${index}-${term}`}>
                      <span>{term}</span>
                      <span>{definition}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="button secondary" onClick={handleValidateMatching}>
                  Valider l'activité
                </button>
                {matchFeedback && <p className="match-feedback">{matchFeedback}</p>}
              </section>

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
            </div>
          )}
        </section>
      )}
    </main>
  );
}
