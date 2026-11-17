// PDF standard fonts support WinAnsi, including French accents and punctuation.
const winAnsi = '€□‚ƒ„…†‡ˆ‰Š‹Œ□Ž□□‘’“”•–—˜™š›œ□žŸ';

function pdfText(text) {
  return '<' + Array.from(text.normalize('NFC'), character => {
    const code = character.codePointAt(0);
    const extended = winAnsi.indexOf(character);
    const byte = (code >= 32 && code <= 126) || (code >= 160 && code <= 255)
      ? code : extended >= 0 && character !== '□' ? 128 + extended : 63;
    return byte.toString(16).padStart(2, '0');
  }).join('') + '>';
}

function wrap(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').flatMap(paragraph => {
    const lines = [];
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      for (const part of word.match(/.{1,76}/gu) || []) {
        if (line && line.length + part.length + 1 > 76) {
          lines.push(line);
          line = '';
        }
        line += (line ? ' ' : '') + part;
      }
    }
    return [...lines, line];
  });
}

export function buildReflectionPdf({ goals, canDo, reflection, nextGoal }) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'
  ];
  const pages = [];
  let commands = [];
  let y = 0;
  function finishPage() {
    const id = objects.length + 1;
    const stream = commands.join('\n') + '\n';
    pages.push(id + ' 0 R');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Heading 3 0 R /Body 4 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream'
    );
  }
  function startPage() {
    commands = ['0.12 0.24 0.23 rg', 'BT /Heading 20 Tf 54 736 Td ' + pdfText('Francophone Social Mixer') + ' Tj ET',
      'BT /Heading 11 Tf 54 713 Td ' + pdfText('French Beginner 1 | Can-Do Reflection') + ' Tj ET'];
    y = 676;
  }
  startPage();
  const sections = [
    ['Your starting goals', goals.map(goal => '- ' + goal).join('\n')],
    ['Selected Can-Do', canDo],
    ['Your reflection', reflection],
    ...(nextGoal ? [['Your next goal', nextGoal]] : [])
  ];
  for (const [heading, text] of sections) {
    if (y < 88) {
      finishPage();
      startPage();
    }
    commands.push('BT /Heading 12 Tf 54 ' + y + ' Td ' + pdfText(heading) + ' Tj ET');
    y -= 19;
    for (const line of wrap(text)) {
      if (y < 54) {
        finishPage();
        startPage();
      }
      commands.push('BT /Body 11 Tf 54 ' + y + ' Td ' + pdfText(line) + ' Tj ET');
      y -= 15;
    }
    y -= 13;
  }
  finishPage();
  objects[1] = '<< /Type /Pages /Kids [' + pages.join(' ') + '] /Count ' + pages.length + ' >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
    + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([pdf], { type: 'application/pdf' });
}
