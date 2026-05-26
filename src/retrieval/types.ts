export type IndexedDoc = { id: string; text: string };

export type Bm25Index = {
  docs: ReadonlyArray<IndexedDoc>;
  termFreqs: ReadonlyArray<ReadonlyMap<string, number>>;
  docLengths: ReadonlyArray<number>;
  idf: ReadonlyMap<string, number>;
  avgDocLength: number;
  totalDocs: number;
};

export type SearchHit = { id: string; score: number };
export type SearchOptions = { limit: number };
