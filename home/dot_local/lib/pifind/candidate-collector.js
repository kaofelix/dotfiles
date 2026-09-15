export class CandidateCollector {
  constructor({ validatePath, maxCandidates = 10 }) {
    this.validatePath = validatePath;
    this.maxCandidates = maxCandidates;
    this.candidates = [];
  }

  async accept(candidates) {
    const accepted = [];
    const seen = new Set();

    for (const candidate of candidates.slice(0, this.maxCandidates)) {
      const sessionFile = await this.validatePath(candidate.sessionFile);
      if (seen.has(sessionFile)) continue;
      seen.add(sessionFile);
      accepted.push({
        sessionFile,
        title: candidate.title.trim(),
        explanation: candidate.explanation.trim(),
        excerpt: candidate.excerpt.trim(),
        confidence: Math.max(0, Math.min(1, candidate.confidence)),
        ...(candidate.cwd ? { cwd: candidate.cwd.trim() } : {}),
        ...(candidate.updatedAt ? { updatedAt: candidate.updatedAt.trim() } : {}),
      });
    }

    this.candidates = accepted;
  }
}
