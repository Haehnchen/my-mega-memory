import { createHash } from 'crypto';

// Namespace UUID for project UUIDs (generated once, fixed forever)
const PROJECT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Generate a deterministic UUID v5 from a project path.
 * Same path will always generate the same UUID.
 * Uses SHA-1 hashing internally (UUID v5 standard).
 * 
 * @param projectPath - The project directory path
 * @returns A UUID string in standard format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 */
export function generateProjectUuid(projectPath: string): string {
  // Normalize the path (remove trailing slashes, resolve .. etc)
  const normalizedPath = projectPath
    .replace(/\\/g, '/') // Convert backslashes to forward slashes
    .replace(/\/$/, '') // Remove trailing slash
    .toLowerCase(); // Normalize case
  
  // Create a deterministic UUID v5 using our namespace and the path
  const hash = createHash('sha1');
  hash.update(PROJECT_NAMESPACE);
  hash.update(normalizedPath);
  const digest = hash.digest();
  
  // Format as UUID v5
  // Set version (0101 = version 5)
  digest[6] = (digest[6] & 0x0f) | 0x50;
  // Set variant (10 = RFC 4122 variant)
  digest[8] = (digest[8] & 0x3f) | 0x80;
  
  // Convert to UUID string format
  const hex = digest.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}