// ── React Global Setup ──
// Must be imported BEFORE app.jsx to ensure React is available as a global.
// This is a transitional compatibility layer — the eventual goal is to have
// app.jsx import React directly, but with 18K lines using global React, this
// provides backward compatibility without modifying every file.

import React from 'react';
import ReactDOM from 'react-dom/client';

window.React = React;
window.ReactDOM = { createRoot: ReactDOM.createRoot };

export { React, ReactDOM };
