import { build } from 'esbuild';
await build({entryPoints:['src/ui/app.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],jsx:'automatic',outfile:'assets/app.js',minify:true,legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}});
console.log('Built assets/app.js (Bklit chart components included)');
