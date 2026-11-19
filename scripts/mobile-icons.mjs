/** Exporte la patte et les couleurs Plein air, sans dépendance ajoutée au produit.
 * Préparation : npm install --prefix .mobile-tools/icon-render --no-save --package-lock=false sharp@0.34.5
 * Exécution : node scripts/mobile-icons.mjs
 */
import fs from 'node:fs/promises';
import sharp from '../.mobile-tools/icon-render/node_modules/sharp/lib/index.js';

const tokensText = await fs.readFile('src/design-system/tokens/tokens.ts','utf8');
const rawTokens = tokensText.match(/export const tokens = ([\s\S]*?) as const;/)?.[1];
if (!rawTokens) throw Error('Jetons Plein air introuvables.');
const tokens = JSON.parse(rawTokens);
const ink = tokens.color.ink.DEFAULT, bg = tokens.color.surface.page, dot = tokens.color.poppy.DEFAULT;
// Géométrie de Icon name="paw", conservée depuis le design system.
const iconSource = await fs.readFile('src/design-system/icons/Icon.tsx','utf8');
const paw = iconSource.match(/paw: <>(.*?)<\/>/s)?.[1];
if (!paw) throw Error('Pictogramme patte introuvable.');
const mark = `<g fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(16.5 17) scale(3)">${paw}</g><circle cx="72" cy="76" r="3.5" fill="${dot}"/>`;
const svg = (background=true, viewBox='0 0 108 108') => `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="${viewBox}">${background?`<rect width="108" height="108" fill="${bg}"/>`:''}${mark}</svg>`;
await fs.writeFile('resources/furrix-icon.svg',svg());
const root='android/app/src/main/res';
for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
  const folder=`${root}/mipmap-${density}`;
  for(const name of ['ic_launcher','ic_launcher_round']) await sharp(Buffer.from(svg(true,'18 18 72 72'))).resize(48*scale,48*scale).png().toFile(`${folder}/${name}.png`);
  await sharp(Buffer.from(svg(false))).resize(108*scale,108*scale).png().toFile(`${folder}/ic_launcher_foreground.png`);
}
await fs.writeFile(`${root}/values/ic_launcher_background.xml`,`<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${bg}</color></resources>\n`);
await fs.mkdir(`${root}/mipmap-anydpi-v33`,{recursive:true});
for(const name of ['ic_launcher','ic_launcher_round']) await fs.writeFile(`${root}/mipmap-anydpi-v33/${name}.xml`,`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n  <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`);
await sharp(Buffer.from(svg(true,'18 18 72 72'))).resize(1024,1024).flatten({background:bg}).removeAlpha().png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
console.log('Icônes Android et iOS exportées depuis le design system.');
