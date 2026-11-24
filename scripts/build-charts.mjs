import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

// The chart library is bundled once, with only the charts Medjat draws, and the result is
// committed like the other vendored files. Run this after changing the list below.
const entry = `
import * as echarts from 'echarts/core';
import { ScatterChart, TreemapChart } from 'echarts/charts';
import {
  GridComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([
  ScatterChart,
  TreemapChart,
  GridComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  LabelLayout,
  SVGRenderer,
]);
export { echarts };
`;

const out = new URL('../assets/vendor/echarts/', import.meta.url);
await mkdir(out, { recursive: true });
await build({
  stdin: { contents: entry, resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true,
  minify: true,
  format: 'esm',
  legalComments: 'none',
  outfile: new URL('echarts.js', out).pathname,
  logLevel: 'info',
});
for (const file of ['LICENSE', 'NOTICE'])
  await copyFile(new URL(`../node_modules/echarts/${file}`, import.meta.url), new URL(file, out));
