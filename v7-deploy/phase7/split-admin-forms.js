#!/usr/bin/env node
// Phase 9a: Split AdminDash.jsx — extract top-level forms/helpers/data
// Cuts these from AdminDash.jsx and places them in dedicated files:
//   features/admin/data/templates.js       (DEFAULT_TEMPLATES + TEMPLATE_VARS + applyTemplatePreview)
//   features/admin/forms/PlacesAutocomplete.jsx
//   features/admin/forms/TemplateEditorPopup.jsx  (imports templates.js)
//   features/admin/forms/NewCollabForm.jsx
//   features/admin/forms/NewCompanyForm.jsx
//   features/admin/forms/NewCalForm.jsx           (imports TemplateEditorPopup + templates.js)
//   features/admin/forms/index.js                 (barrel for AdminDash to import)
//
// AdminDash.jsx loses ~821 lines and gains 1 barrel import line.

const fs = require('fs');
const path = require('path');

const ADMIN_PATH = path.resolve(__dirname, '../../app/src/features/admin/AdminDash.jsx');
const TARGET_DIR = path.resolve(__dirname, '../../app/src/features/admin');

// Block definitions: [start_line_1based, end_line_1based, target_filename, kind]
// Lines verified manually before script run.
const BLOCKS = [
  // [start, end, file_relative_to_features_admin, header_kind]
  [11770, 12008, 'forms/NewCollabForm.jsx',     'form-collab'],
  [12010, 12083, 'forms/NewCompanyForm.jsx',    'form-company'],
  [12085, 12101, 'forms/PlacesAutocomplete.jsx', 'places'],
  [12103, 12117, 'data/templates.js',           'templates-data'],     // DEFAULT_TEMPLATES + TEMPLATE_VARS
  [12119, 12123, 'data/templates.js-append',    'templates-fn'],       // applyTemplatePreview (appended to templates.js)
  [12125, 12185, 'forms/TemplateEditorPopup.jsx', 'template-editor'],
  [12187, 12596, 'forms/NewCalForm.jsx',        'form-cal'],
];

const HEADERS = {
  'form-collab': `import React, { useState } from "react";
import { T } from "../../../theme";
import { COMMON_TIMEZONES } from "../../../shared/utils/constants";
import { isValidEmail } from "../../../shared/utils/validators";
import { I, Btn, Input, ValidatedInput, Stars } from "../../../shared/ui";

`,
  'form-company': `import React, { useState } from "react";
import { T } from "../../../theme";
import { isValidEmail } from "../../../shared/utils/validators";
import { I, Btn, ValidatedInput } from "../../../shared/ui";
import PlacesAutocomplete from "./PlacesAutocomplete";

`,
  'places': `import React, { useRef, useEffect } from "react";
import { T } from "../../../theme";

`,
  'templates-data': `// AdminDash form template constants and helpers
// Extracted from AdminDash.jsx in Phase 9a

`,
  'template-editor': `import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn } from "../../../shared/ui";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS, applyTemplatePreview } from "../data/templates";

`,
  'form-cal': `import React, { useState, useEffect } from "react";
import { T } from "../../../theme";
import { COMMON_TIMEZONES } from "../../../shared/utils/constants";
import { isValidEmail } from "../../../shared/utils/validators";
import { displayPhone } from "../../../shared/utils/phone";
import { fmtDate } from "../../../shared/utils/dates";
import { api } from "../../../shared/services/api";
import { I, Btn, Input, ValidatedInput, Badge, Card, Modal } from "../../../shared/ui";
import TemplateEditorPopup from "./TemplateEditorPopup";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS } from "../data/templates";

`,
};

const FOOTERS = {
  'form-collab':    '\n\nexport default NewCollabForm;\n',
  'form-company':   '\n\nexport default NewCompanyForm;\n',
  'places':         '\n\nexport default PlacesAutocomplete;\n',
  'templates-data': '',  // appended in next block
  'template-editor': '\n\nexport default TemplateEditorPopup;\n',
  'form-cal':       '\n\nexport default NewCalForm;\n',
};

function main() {
  if (!fs.existsSync(ADMIN_PATH)) {
    console.error('ERR: AdminDash.jsx not found at', ADMIN_PATH);
    process.exit(1);
  }

  const src = fs.readFileSync(ADMIN_PATH, 'utf8');
  const lines = src.split('\n');

  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${ADMIN_PATH}.pre-split-${ts}`;
  fs.writeFileSync(backupPath, src);
  console.log('Backup written:', backupPath);

  // Verify each block start matches what we expect
  for (const [start, end, file, kind] of BLOCKS) {
    const startLine = lines[start - 1];
    const expected = {
      'form-collab':     /^const NewCollabForm/,
      'form-company':    /^const NewCompanyForm/,
      'places':          /^const PlacesAutocomplete/,
      'templates-data':  /^const DEFAULT_TEMPLATES/,
      'templates-fn':    /^function applyTemplatePreview/,
      'template-editor': /^const TemplateEditorPopup/,
      'form-cal':        /^const NewCalForm/,
    }[kind];
    if (!expected.test(startLine)) {
      console.error(`ERR: line ${start} does not match expected pattern for ${kind}: ${startLine.slice(0,80)}`);
      process.exit(1);
    }
  }
  console.log('All block markers validated');

  // Build templates.js content (special: it gets data block + fn block)
  const tplDataLines = lines.slice(12103 - 1, 12117);
  const tplFnLines = lines.slice(12119 - 1, 12123);
  const templatesContent = HEADERS['templates-data']
    + 'export ' + tplDataLines[0] + '\n'  // export const DEFAULT_TEMPLATES = {
    + tplDataLines.slice(1, 6).join('\n') + '\n\n'  // body of DEFAULT_TEMPLATES
    + 'export ' + tplDataLines[6] + '\n'  // export const TEMPLATE_VARS = [
    + tplDataLines.slice(7).join('\n') + '\n\n'  // body of TEMPLATE_VARS
    + 'export ' + tplFnLines[0] + '\n'  // export function applyTemplatePreview(...) {
    + tplFnLines.slice(1).join('\n') + '\n';

  fs.mkdirSync(path.join(TARGET_DIR, 'data'), { recursive: true });
  const tplPath = path.join(TARGET_DIR, 'data/templates.js');
  fs.writeFileSync(tplPath, templatesContent);
  console.log('Wrote', tplPath, `(${templatesContent.split('\n').length} lines)`);

  // For other forms, write straight from lines
  fs.mkdirSync(path.join(TARGET_DIR, 'forms'), { recursive: true });
  for (const [start, end, file, kind] of BLOCKS) {
    if (kind === 'templates-data' || kind === 'templates-fn') continue;
    const blockSrc = lines.slice(start - 1, end).join('\n');
    const content = HEADERS[kind] + blockSrc + FOOTERS[kind];
    const outPath = path.join(TARGET_DIR, file);
    fs.writeFileSync(outPath, content);
    console.log('Wrote', outPath, `(${content.split('\n').length} lines)`);
  }

  // Write barrel
  const barrel = `// AdminDash forms barrel — Phase 9a
export { default as NewCollabForm } from "./NewCollabForm";
export { default as NewCompanyForm } from "./NewCompanyForm";
export { default as PlacesAutocomplete } from "./PlacesAutocomplete";
export { default as TemplateEditorPopup } from "./TemplateEditorPopup";
export { default as NewCalForm } from "./NewCalForm";
`;
  fs.writeFileSync(path.join(TARGET_DIR, 'forms/index.js'), barrel);
  console.log('Wrote barrel: forms/index.js');

  // Now rewrite AdminDash.jsx: remove lines 11770..12596 and inject barrel import
  // Find the existing `} from "./screens";` line to anchor the new import
  const screensImportIdx = lines.findIndex((l) => l.trim() === '} from "./screens";');
  if (screensImportIdx === -1) {
    console.error('ERR: could not find admin screens import to anchor');
    process.exit(1);
  }

  const beforeBlock = lines.slice(0, 11770 - 1);
  const afterBlock = lines.slice(12596);  // line 12597 onward (0-indexed = 12596)
  const newImportLines = [
    '',
    '// Phase 9a — extracted forms barrel',
    'import { NewCollabForm, NewCompanyForm, PlacesAutocomplete, TemplateEditorPopup, NewCalForm } from "./forms";',
  ];

  // Insert import lines AFTER the screens import (which is in beforeBlock since 11770 > screensImportIdx)
  const importedBefore = [
    ...beforeBlock.slice(0, screensImportIdx + 1),
    ...newImportLines,
    ...beforeBlock.slice(screensImportIdx + 1),
  ];

  const newAdminContent = [...importedBefore, ...afterBlock].join('\n');
  fs.writeFileSync(ADMIN_PATH, newAdminContent);
  const newLineCount = newAdminContent.split('\n').length;
  console.log(`Rewrote AdminDash.jsx: ${newLineCount} lines (was ${lines.length}, diff -${lines.length - newLineCount})`);
}

main();
