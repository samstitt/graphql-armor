import { assertSingleExecutionValue, createTestkit } from '@envelop/testing';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { describe, expect, it } from '@jest/globals';
import { getIntrospectionQuery } from 'graphql';

import { maxDepthPlugin } from '../src/index';

const typeDefinitions = `
  type Author {
    name: String
    books: [Book]
  }

  type Book {
    title: String
    author: Author
  }

  type Query {
    books: [Book]
  }
`;
const books = [
  {
    title: 'The Awakening',
    author: { name: 'Kate Chopin' },
  },
  {
    title: 'City of Glass',
    author: { name: 'Paul Auster' },
  },
];

const resolvers = {
  Query: {
    books: () => books,
  },
  Author: {
    books: (author) => books.filter((book) => book.author === author.name),
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});

describe('global', () => {
  it('should be defined', () => {
    expect(maxDepthPlugin).toBeDefined();

    const t0 = maxDepthPlugin();
    const t1 = maxDepthPlugin({});
    const t2 = maxDepthPlugin({ n: 10 });
  });

  const query = `query {
    books {
      author {
        name
      }
      title
    }
  }`;

  it('should works by default', async () => {
    const testkit = createTestkit([], schema);
    const result = await testkit.execute(query);

    assertSingleExecutionValue(result);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      books: books,
    });
  });

  it('should reject query', async () => {
    const maxDepth = 1;
    const testkit = createTestkit([maxDepthPlugin({ n: maxDepth })], schema);
    const result = await testkit.execute(query);

    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toEqual([
      `Syntax Error: Query depth limit of ${maxDepth} exceeded, found ${maxDepth + 2}.`,
    ]);
  });

  it('should reject fragment', async () => {
    const maxDepth = 4;
    const testkit = createTestkit([maxDepthPlugin({ n: maxDepth })], schema);
    const result = await testkit.execute(`
    query {
      ...BooksFragment
    }

    fragment BooksFragment on Query {
      books {
        title
        author {
          name
        }
      }
    }
    `);

    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toEqual([
      `Syntax Error: Query depth limit of ${maxDepth} exceeded, found ${maxDepth + 1}.`,
    ]);
  });

  it('should reject flattened fragment', async () => {
    const maxDepth = 2;
    const testkit = createTestkit([maxDepthPlugin({ n: maxDepth, flattenFragments: true })], schema);
    const result = await testkit.execute(`
    query {
      ...BooksFragment
    }

    fragment BooksFragment on Query {
      books {
        title
        author {
          name
        }
      }
    }
    `);

    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toEqual([
      `Syntax Error: Query depth limit of ${maxDepth} exceeded, found ${maxDepth + 1}.`,
    ]);
  });

  it('should reject flattened inline fragment', async () => {
    const maxDepth = 2;
    const testkit = createTestkit([maxDepthPlugin({ n: maxDepth, flattenFragments: true })], schema);
    const result = await testkit.execute(`
    query {
      ...on Query {
        books {
          title
          author {
            name
          }
        }
      }
    }
    `);

    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toEqual([
      `Syntax Error: Query depth limit of ${maxDepth} exceeded, found ${maxDepth + 1}.`,
    ]);
  });

  it('should allow introspection', async () => {
    const testkit = createTestkit([maxDepthPlugin({ n: 2, ignoreIntrospection: true })], schema);
    const result = await testkit.execute(getIntrospectionQuery());

    assertSingleExecutionValue(result);
    expect(result.errors).toBeUndefined();
    expect(result.data?.__schema).toBeDefined();
  });

  it('should not crash on recursive fragment', async () => {
    const testkit = createTestkit([maxDepthPlugin({ n: 3 })], schema);
    const result = await testkit.execute(`query {
        ...A
      }

      fragment A on Query {
        ...B
      }

      fragment B on Query {
        ...A
      }
    `);
    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toContain(
      'Syntax Error: Query depth limit of 3 exceeded, found 4.',
    );
  });

  it('should not crash on flattened recursive fragment', async () => {
    const testkit = createTestkit([maxDepthPlugin({ n: 3, flattenFragments: true })], schema);
    const result = await testkit.execute(`query {
        ...A
      }

      fragment A on Query {
        ...B
      }

      fragment B on Query {
        ...A
      }
    `);
    assertSingleExecutionValue(result);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((error) => error.message)).toContain('Cannot spread fragment "A" within itself via "B".');
  });
});
