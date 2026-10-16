export function largeDocument(sections = 26000) {
  return Array.from({ length: sections }, (_, i) => `## Section ${i}\n\nSome **bold text** and a [link](https://example.com). A paragraph for the reader.\n\n- First item\n- Second item\n\n\`\`\`js\nconst value = ${i};\n\`\`\`\n\n| Name | Value |\n| --- | --- |\n| row | ${i} |\n\n`).join('');
}
