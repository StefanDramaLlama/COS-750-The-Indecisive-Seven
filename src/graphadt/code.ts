import type { GraphConfig, OpName } from './types.ts';

export type Representation = 'matrix' | 'list';

export interface CodeSample {
  className: string;
  /** Complete, runnable TypeScript for the class. */
  full: string;
  /** The source of each operation on its own. */
  ops: Partial<Record<OpName, string>>;
}

const indent = (text: string, spaces: number) => text.split('\n').map(line => (line ? ' '.repeat(spaces) + line : line)).join('\n');

const className = (config: GraphConfig, rep: Representation) => {
  const shape = config.weighted && config.directed ? 'WeightedDirected' : config.weighted ? 'Weighted' : config.directed ? 'Directed' : 'Undirected';
  return `${shape}${rep === 'matrix' ? 'Matrix' : 'List'}Graph`;
};

const checkWeight = `if (!Number.isInteger(weight) || weight < 1 || weight > 99) throw new Error('Weight must be a whole number from 1 to 99');`;

/** Build the code for one graph type and one representation. Both representations visit neighbours in alphabetical order, like the lessons do. */
export function buildCode(config: GraphConfig, rep: Representation): CodeSample {
  const D = config.directed;
  const W = config.weighted;
  const name = className(config, rep);
  const ops: Partial<Record<OpName, string>> = {};
  const traversal = (): void => {
    ops.bfs = `bfs(start: string): string[] {
  const order: string[] = [];
  const discovered = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const v = queue.shift()!;               // dequeue
    order.push(v);                          // visit
    for (const n of this.neighbors(v)) {
      if (!discovered.has(n)) {
        discovered.add(n);                  // mark when queued
        queue.push(n);
      }
    }
  }
  return order;
}`;
    ops.dfs = `dfs(start: string): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (v: string): void => {
    visited.add(v);
    order.push(v);                          // visit on the way in
    for (const n of this.neighbors(v)) {
      if (!visited.has(n)) visit(n);        // go deeper
    }
  };                                        // returning = backtracking
  visit(start);
  return order;
}`;
  };

  let header: string;
  if (rep === 'matrix') {
    header = `const NO_EDGE = ${W ? 'Infinity' : '0'};   // what an empty cell holds

class ${name} {
  private labels: string[] = [];      // row i and column i belong to labels[i]
  private cells: number[][] = [];     // cells[i][j] ${W ? 'is the weight of the edge from i to j, or Infinity' : 'is 1 when there is an edge from i to j, else 0'}

  private indexOf(v: string): number {
    const i = this.labels.indexOf(v);
    if (i === -1) throw new Error(\`No vertex \${v}\`);
    return i;
  }
`;
    ops.addVertex = `addVertex(v: string): void {
  if (this.labels.includes(v)) throw new Error(\`Vertex \${v} already exists\`);
  let at = this.labels.findIndex(label => label > v);  // keep labels sorted
  if (at === -1) at = this.labels.length;
  this.labels.splice(at, 0, v);
  for (const row of this.cells) row.splice(at, 0, NO_EDGE);        // new column in every row
  this.cells.splice(at, 0, this.labels.map(() => NO_EDGE));        // new row
}`;
    ops.removeVertex = `removeVertex(v: string): void {
  const i = this.indexOf(v);
  this.labels.splice(i, 1);
  this.cells.splice(i, 1);                               // delete row i
  for (const row of this.cells) row.splice(i, 1);        // delete column i
}`;
    ops.addEdge = `addEdge(u: string, v: string${W ? ', weight: number' : ''}): void {
  const i = this.indexOf(u);
  const j = this.indexOf(v);
  if (i === j) throw new Error('Self-loops are not allowed');
  if (this.cells[i][j] !== NO_EDGE) throw new Error('Edge already exists');${W ? `\n  ${checkWeight}` : ''}
  this.cells[i][j] = ${W ? 'weight' : '1'};${D ? '' : `\n  this.cells[j][i] = ${W ? 'weight' : '1'};                       // undirected: mirror the cell`}
}`;
    ops.removeEdge = `removeEdge(u: string, v: string): void {
  const i = this.indexOf(u);
  const j = this.indexOf(v);
  if (this.cells[i][j] === NO_EDGE) throw new Error('No such edge');
  this.cells[i][j] = NO_EDGE;${D ? '' : '\n  this.cells[j][i] = NO_EDGE;                         // undirected: clear the mirror too'}
}`;
    if (W) {
      ops.updateWeight = `updateWeight(u: string, v: string, weight: number): void {
  const i = this.indexOf(u);
  const j = this.indexOf(v);
  if (this.cells[i][j] === NO_EDGE) throw new Error('No such edge');
  ${checkWeight}
  this.cells[i][j] = weight;${D ? '' : '\n  this.cells[j][i] = weight;                        // undirected: the mirror stores the same weight'}
}`;
    }
    ops.hasEdge = `hasEdge(u: string, v: string): boolean {
  return this.cells[this.indexOf(u)][this.indexOf(v)] !== NO_EDGE;   // one array lookup
}`;
    ops.neighbors = `neighbors(v: string): string[] {
  const i = this.indexOf(v);
  return this.labels.filter((_, j) => this.cells[i][j] !== NO_EDGE);   // scan the whole row
}`;
    ops.degree = D
      ? `degree(v: string): { out: number; in: number } {
  const i = this.indexOf(v);
  const out = this.cells[i].filter(cell => cell !== NO_EDGE).length;     // count along the row
  const inDegree = this.cells.filter(row => row[i] !== NO_EDGE).length;  // count down the column
  return { out, in: inDegree };
}`
      : `degree(v: string): number {
  return this.neighbors(v).length;                       // count the row
}`;
    ops.vertexCount = `vertexCount(): number {
  return this.labels.length;
}`;
    ops.edgeCount = `edgeCount(): number {
  let filled = 0;
  for (const row of this.cells) for (const cell of row) if (cell !== NO_EDGE) filled++;
  return ${D ? 'filled' : 'filled / 2'};${D ? '' : '                              // each undirected edge fills two cells'}
}`;
    ops.isEmpty = `isEmpty(): boolean {
  return this.labels.length === 0;
}`;
    traversal();
  } else {
    header = `interface Entry { to: string;${W ? ' weight: number;' : ''} }

class ${name} {
  private lists = new Map<string, Entry[]>();   // vertex -> its neighbours

  private list(v: string): Entry[] {
    const list = this.lists.get(v);
    if (!list) throw new Error(\`No vertex \${v}\`);
    return list;
  }

  private insert(from: string, entry: Entry): void {
    const list = this.list(from);
    const at = list.findIndex(e => e.to > entry.to);     // keep each list sorted
    list.splice(at === -1 ? list.length : at, 0, entry);
  }

  private erase(from: string, to: string): void {
    const list = this.list(from);
    list.splice(list.findIndex(e => e.to === to), 1);
  }
`;
    ops.addVertex = `addVertex(v: string): void {
  if (this.lists.has(v)) throw new Error(\`Vertex \${v} already exists\`);
  this.lists.set(v, []);                                  // one new, empty list
  this.lists = new Map([...this.lists].sort(([a], [b]) => (a < b ? -1 : 1)));  // keep rows in label order
}`;
    ops.removeVertex = `removeVertex(v: string): void {
  this.list(v);                                           // throws if v is missing
  this.lists.delete(v);                                   // delete v's own list
  for (const list of this.lists.values()) {               // then scan every list for v
    const at = list.findIndex(e => e.to === v);
    if (at !== -1) list.splice(at, 1);
  }
}`;
    ops.addEdge = `addEdge(u: string, v: string${W ? ', weight: number' : ''}): void {
  this.list(u); this.list(v);
  if (u === v) throw new Error('Self-loops are not allowed');
  if (this.hasEdge(u, v)) throw new Error('Edge already exists');${W ? `\n  ${checkWeight}` : ''}
  this.insert(u, { to: v${W ? ', weight' : ''} });${D ? '' : `\n  this.insert(v, { to: u${W ? ', weight' : ''} });                  // undirected: store it from both ends`}
}`;
    ops.removeEdge = `removeEdge(u: string, v: string): void {
  if (!this.hasEdge(u, v)) throw new Error('No such edge');
  this.erase(u, v);${D ? '' : '\n  this.erase(v, u);                                       // undirected: remove it from both ends'}
}`;
    if (W) {
      ops.updateWeight = `updateWeight(u: string, v: string, weight: number): void {
  if (!this.hasEdge(u, v)) throw new Error('No such edge');
  ${checkWeight}
  this.list(u).find(e => e.to === v)!.weight = weight;${D ? '' : '\n  this.list(v).find(e => e.to === u)!.weight = weight;  // undirected: both ends store the weight'}
}`;
    }
    ops.hasEdge = `hasEdge(u: string, v: string): boolean {
  return this.list(u).some(e => e.to === v);              // walk u's list
}`;
    ops.neighbors = `neighbors(v: string): string[] {
  return this.list(v).map(e => e.to);                     // just read v's list
}`;
    ops.degree = D
      ? `degree(v: string): { out: number; in: number } {
  const out = this.list(v).length;                        // length of v's list
  let inDegree = 0;
  for (const list of this.lists.values()) {               // in-degree needs every list
    if (list.some(e => e.to === v)) inDegree++;
  }
  return { out, in: inDegree };
}`
      : `degree(v: string): number {
  return this.list(v).length;                             // length of v's list
}`;
    ops.vertexCount = `vertexCount(): number {
  return this.lists.size;
}`;
    ops.edgeCount = `edgeCount(): number {
  let entries = 0;
  for (const list of this.lists.values()) entries += list.length;
  return ${D ? 'entries' : 'entries / 2'};${D ? '' : '                             // every edge is stored twice'}
}`;
    ops.isEmpty = `isEmpty(): boolean {
  return this.lists.size === 0;
}`;
    traversal();
  }

  const order: OpName[] = ['addVertex', 'removeVertex', 'addEdge', 'removeEdge', 'updateWeight', 'hasEdge', 'neighbors', 'degree', 'vertexCount', 'edgeCount', 'isEmpty', 'bfs', 'dfs'];
  const body = order.filter(op => ops[op]).map(op => indent(ops[op]!, 2)).join('\n\n');
  const full = `${header}\n${body}\n}\n`;
  return { className: name, full, ops };
}
