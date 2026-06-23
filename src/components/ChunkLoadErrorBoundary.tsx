import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches "Failed to fetch dynamically imported module" errors that occur when
// a new deployment changes chunk hashes while a user still has the old HTML cached.
// Forces a hard reload so the browser fetches fresh HTML with correct chunk URLs.
// sessionStorage flag prevents an infinite reload loop if the error persists.
export class ChunkLoadErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError';

    if (isChunkError && !sessionStorage.getItem('chunk-reload-attempted')) {
      sessionStorage.setItem('chunk-reload-attempted', '1');
      window.location.reload();
    }
  }

  render() {
    // If not a chunk error (or reload already attempted), render nothing rather than crashing.
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
