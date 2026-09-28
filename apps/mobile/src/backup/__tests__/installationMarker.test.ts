import { fileInstallationMarker, parseInstallationMarker } from '../installationMarker';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///document' },
  File: class {
    private readonly uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }

    get exists() {
      return mockFiles.has(this.uri);
    }

    create() {
      if (mockFiles.has(this.uri)) throw new Error('File already exists');
      mockFiles.set(this.uri, '');
    }

    async text() {
      return mockFiles.get(this.uri) ?? '';
    }

    write(contents: string) {
      mockFiles.set(this.uri, contents);
    }
  },
}));

const MARKER_URI = 'file:///document/forgelog-installation.json';

beforeEach(() => {
  mockFiles.clear();
});

test('parses a well-formed marker', () => {
  expect(parseInstallationMarker('{"installation_id":"install-a"}')).toBe('install-a');
});

test.each(['', 'not json', 'null', '{}', '{"installation_id":""}', '{"installation_id":7}'])(
  'rejects malformed marker contents %p',
  (contents) => {
    expect(parseInstallationMarker(contents)).toBeNull();
  }
);

test('creates a marker on first read and returns the same ID afterwards', async () => {
  const first = await fileInstallationMarker.readOrCreate();

  expect(first).toEqual(expect.any(String));
  expect(JSON.parse(mockFiles.get(MARKER_URI) ?? '')).toEqual({ installation_id: first });
  await expect(fileInstallationMarker.readOrCreate()).resolves.toBe(first);
});

test('replaces a corrupt marker with a new installation ID', async () => {
  mockFiles.set(MARKER_URI, '{"installation_id":');

  const installationId = await fileInstallationMarker.readOrCreate();

  expect(JSON.parse(mockFiles.get(MARKER_URI) ?? '')).toEqual({
    installation_id: installationId,
  });
});
