/**
 * @module PythonHeaderGenerator
 * @description Build-time script to generate a sequential terminal-style Python header.
 */

/**
 * CYNTHIA'S PYTHON HEADER GENERATOR 🐍
 *
 * This script generates a single SVG with perfect 4-space
 * indentation and sequential typing for the intro.
 */

import fs from "fs";

const lines = [
  { text: "try:", indent: 0, start: 0, end: 1 },
  { text: "understand_first()", indent: 4, start: 1.2, end: 2.5 },
  { text: "then_build()", indent: 4, start: 2.7, end: 4 },
  { text: "except shortcuts:", indent: 0, start: 4.2, end: 5.5 },
  { text: "raise BetterQuestion", indent: 4, start: 5.7, end: 7 },
];

const totalDuration = 8; // Total time for the whole sequence to finish

let textElements = "";
let animations = "";

lines.forEach((line, i) => {
  const y = 25 + i * 28;
  const x = 10 + line.indent * 10; // 10px per character for indentation

  // Animation: Stay hidden, then type out, then stay visible
  animations += `
    @keyframes type${i} {
      0% { clip-path: inset(0 100% 0 0); }
      ${((line.start / totalDuration) * 100).toFixed(2)}% { clip-path: inset(0 100% 0 0); opacity: 1; }
      ${((line.end / totalDuration) * 100).toFixed(2)}% { clip-path: inset(0 0 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); opacity: 1; }
    }
    .line${i} { 
      opacity: 0;
      animation: type${i} ${totalDuration}s steps(40) forwards;
    }
  `;

  textElements += `<text x="${x}" y="${y}" class="text line${i}">${line.text}</text>\n`;
});

const svg = `<svg width="450" height="180" viewBox="0 0 450 180" xmlns="http://www.w3.org/2000/svg">
  <style>
    .text { 
      font-family: 'Fira Code', 'Courier New', monospace; 
      font-size: 22px; 
      fill: #53F7AE; 
      font-weight: 600;
    }
    ${animations}
  </style>
  ${textElements}
</svg>`;

fs.writeFileSync("./python_header.svg", svg);
