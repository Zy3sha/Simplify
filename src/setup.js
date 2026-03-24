// ── React Global Setup ──
// Must be imported BEFORE app.jsx to ensure React is available as a global.
// This is a transitional compatibility layer — the eventual goal is to have
// app.jsx import React directly, but with 18K lines using global React, this
// provides backward compatibility without modifying every file.

import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOMFull from 'react-dom';

window.React = React;
window.ReactDOM = { ...ReactDOMFull, createRoot: ReactDOMClient.createRoot };

export { React };
