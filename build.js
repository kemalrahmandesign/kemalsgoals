/* Inlines every stylesheet and script into one file.

   BRIEF.md's original constraint was a single self-contained HTML file, and
   that is still the most portable way to carry this around: open it straight
   off disk, drop it on any host, or paste it somewhere with no server at all.
   The split sources stay the thing you edit.

   Usage: node build.js   ->   standalone.html
*/

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// <link rel="stylesheet" href="css/x.css">  ->  <style>…</style>
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) =>
  '<style>\n' + read(href).trim() + '\n</style>\n');

// <script src="js/x.js"></script>  ->  <script>…</script>
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) =>
  '<script>\n' + read(src).trim() + '\n</script>\n');

if (/<link rel="stylesheet"|<script src=/.test(html)) {
  console.error('Something did not inline — check index.html.');
  process.exit(1);
}

fs.writeFileSync(path.join(root, 'standalone.html'), html);
console.log('standalone.html  ' + (fs.statSync(path.join(root, 'standalone.html')).size / 1024).toFixed(0) + ' KB');
