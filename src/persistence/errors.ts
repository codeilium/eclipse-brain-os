/**
 * Eclipse Brain OS — persistence-layer error types.
 *
 * Every failure mode the persistence layer can encounter has a named class.
 * Callers catch broadly with `e instanceof PersistenceError` or narrowly with a
 * specific subclass — never by string-matching a message. Because the project
 * targets ES2017+, `class extends Error` produces a real prototype chain, so
 * `instanceof` works correctly across all of these.
 */

/**
 * Base class for all persistence-layer errors. Allows callers to catch any
 * persistence failure with a single `catch (e) { if (e instanceof PersistenceError) … }`.
 *
 * The optional `cause` carries the underlying error (a DOMException, etc.). It
 * is wired through the standard ES2022 `Error.cause` mechanism — hence the
 * `override` — so `error.cause` reads the same as on any native Error.
 */
export class PersistenceError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PersistenceError";
  }
}

/** The stored universe failed schema validation on load. */
export class CorruptDataError extends PersistenceError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "CorruptDataError";
  }
}

/** Browser refused the write because IndexedDB quota was exceeded. */
export class QuotaExceededError extends PersistenceError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "QuotaExceededError";
  }
}

/**
 * The stored universe has a schema version newer than this code knows how to
 * read. The user is likely running an old build of the app.
 */
export class FutureSchemaError extends PersistenceError {
  constructor(
    public readonly storedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(
      `Stored universe has schemaVersion ${storedVersion} but this build understands up to ${currentVersion}. ` +
        `The user may need to refresh the app to get the latest version.`,
    );
    this.name = "FutureSchemaError";
  }
}

/**
 * A migration step from one schema version to the next failed. The stored data
 * is intact, but cannot be loaded by this build.
 */
export class MigrationError extends PersistenceError {
  constructor(
    public readonly fromVersion: number,
    public readonly toVersion: number,
    cause?: unknown,
  ) {
    super(`Failed to migrate universe from v${fromVersion} to v${toVersion}`, cause);
    this.name = "MigrationError";
  }
}

/**
 * A save attempt was rejected because another tab saved a newer version of the
 * universe after this tab loaded it (last-write-wins prevention).
 */
export class ConcurrentModificationError extends PersistenceError {
  constructor(
    public readonly localLastModified: string,
    public readonly remoteLastModified: string,
  ) {
    super(
      `Another tab modified the universe more recently (remote: ${remoteLastModified}, local: ${localLastModified}). ` +
        `Reload to get the latest version.`,
    );
    this.name = "ConcurrentModificationError";
  }
}
