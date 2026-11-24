let context;

// Chart libraries cannot read oklch(), so each token is painted once and read back as a hex value.
function hex(css) {
  context ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#000';
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function palette() {
  const style = getComputedStyle(document.documentElement);
  const token = (name) => hex(style.getPropertyValue(name).trim());
  const colors = {
    ink: token('--viz-ink'),
    plum: token('--viz-plum'),
    red: token('--viz-red'),
    clay: token('--viz-clay'),
    teal: token('--viz-teal'),
    mist: token('--viz-mist'),
    text: token('--color-ink'),
    secondary: token('--color-secondary'),
    muted: token('--color-muted'),
    line: token('--color-line'),
    canvas: token('--color-canvas'),
    surface: token('--color-surface'),
  };
  return {
    ...colors,
    font: style.getPropertyValue('--font-body').trim(),
    groups: [colors.plum, colors.red, colors.ink, colors.clay],
    publishers: [colors.plum, colors.red, colors.teal, colors.clay, colors.ink],
  };
}
