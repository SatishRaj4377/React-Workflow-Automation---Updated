export interface FileState {
  localFile: File | null;
  localFileUrl: string;
  previewError: string;
}

export interface FileHandlers {
  onUploaderSelected: (args: any) => void;
  onUploaderRemoving: () => void;
  onRemoveChosen: () => void;
  onSelectDefault: (e: any) => void;
  onPreview: () => void;
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

/**
 * Create file upload handler with validation and state management
 */
export const createUploadHandler = (config: {
  validExtensions: string[];
  onFileSelected: (file: File, url: string) => void;
  onError: (message: string) => void;
  settings: any;
  setPreviewError: (msg: string) => void;
}) => {
  return (args: any) => {
    const raw = (args as any)?.filesData?.[0];
    const file: File | undefined = (raw && (raw as any).rawFile) || (args as any)?.event?.target?.files?.[0];
    if (!file) return;

    const isValid = config.validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!isValid) {
      const extStr = config.validExtensions.join(', ');
      config.onError(`Please select a file with extension: ${extStr}`);
      return;
    }

    // Cleanup old URLs
    if (config.settings?.deviceFileUrl) {
      URL.revokeObjectURL(config.settings.deviceFileUrl);
    }

    const url = URL.createObjectURL(file);
    config.setPreviewError('');
    config.onFileSelected(file, url);
  };
};

/**
 * Create file removal handler with URL cleanup
 */
export const createRemovalHandler = (config: {
  onFileRemoved: () => void;
  settings: any;
  localFileUrl: string;
}) => {
  return () => {
    if (config.settings?.deviceFileUrl) {
      URL.revokeObjectURL(config.settings.deviceFileUrl);
    }
    if (config.localFileUrl) {
      URL.revokeObjectURL(config.localFileUrl);
    }
    config.onFileRemoved();
  };
};

/**
 * Create preview/download handler
 */
export const createPreviewHandler = (config: {
  chosenUrl: string;
  localFile: File | null;
  localFileUrl: string;
  onError: (message: string) => void;
}) => {
  return async () => {
    config.onError('');
    if (!config.chosenUrl && !config.localFile) {
      config.onError('No file selected.');
      return;
    }

    try {
      if (config.localFile && config.localFileUrl) {
        window.open(config.localFileUrl, '_blank');
        return;
      }

      if (config.chosenUrl) {
        const res = await fetch(config.chosenUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      }
    } catch (err) {
      console.error('Error opening file:', err);
      config.onError('Unable to open file.');
    }
  };
};



/**
 * Build file uploader props from settings or local state
 */
export const buildUploaderFiles = (config: {
  settings: any;
  localFile: File | null;
}): any => {
  if (config.settings?.fileSource === 'device' && config.settings?.deviceFileMeta) {
    const meta = config.settings.deviceFileMeta;
    return [{ name: meta.name, size: meta.size, type: meta.type }];
  }
  if (config.localFile) {
    return [{ name: config.localFile.name, size: config.localFile.size, type: config.localFile.type }];
  }
  return [];
};
