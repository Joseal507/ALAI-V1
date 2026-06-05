import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ConceptNode,
  ConceptRelation,
  Evidence,
  WorldModelSnapshot,
} from "../types/world-model";

const EMPTY_WORLD_MODEL: WorldModelSnapshot = {
  concepts: [],
  relations: [],
  evidence: [],
  generatedAt: new Date().toISOString(),
};

export class WorldModelStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<WorldModelSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as WorldModelSnapshot;
    } catch {
      return EMPTY_WORLD_MODEL;
    }
  }

  async save(snapshot: WorldModelSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify(
        {
          ...snapshot,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf-8"
    );
  }

  async addConcept(concept: ConceptNode): Promise<WorldModelSnapshot> {
    const snapshot = await this.load();

    const exists = snapshot.concepts.some((item) => item.id === concept.id);

    if (exists) {
      throw new Error(`Concept already exists: ${concept.id}`);
    }

    const next: WorldModelSnapshot = {
      ...snapshot,
      concepts: [...snapshot.concepts, concept],
    };

    await this.save(next);
    return next;
  }

  async addRelation(relation: ConceptRelation): Promise<WorldModelSnapshot> {
    const snapshot = await this.load();

    const exists = snapshot.relations.some((item) => item.id === relation.id);

    if (exists) {
      throw new Error(`Relation already exists: ${relation.id}`);
    }

    const next: WorldModelSnapshot = {
      ...snapshot,
      relations: [...snapshot.relations, relation],
    };

    await this.save(next);
    return next;
  }

  async addEvidence(evidence: Evidence): Promise<WorldModelSnapshot> {
    const snapshot = await this.load();

    const exists = snapshot.evidence.some((item) => item.id === evidence.id);

    if (exists) {
      throw new Error(`Evidence already exists: ${evidence.id}`);
    }

    const next: WorldModelSnapshot = {
      ...snapshot,
      evidence: [...snapshot.evidence, evidence],
    };

    await this.save(next);
    return next;
  }
}
