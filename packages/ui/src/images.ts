// Demo channel images live in the repo's assets/ folder and are referenced by their repo path
// ("assets/illustrations/04-foot.jpg"); bundle them and map those paths to served URLs.
const demo = import.meta.glob<string>('../../../assets/illustrations/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byRepoPath = new Map(
  Object.entries(demo).map(([path, url]) => [path.replace(/^(\.\.\/)+/, ''), url]),
);

/** Displayable URL for a channel image: demo assets by repo path, anything else as is. */
export function imageUrl(image: string | undefined): string | undefined {
  if (!image) return undefined;
  return byRepoPath.get(image) ?? image;
}
