import migrations from '../migrations';
import schema from '../schema';

// The watermelondb mock's `addColumns` takes (table, columns) where the real API
// takes a single {table, columns} object, so a mocked step nests the payload
// under `step.table`. Unwrap either shape.
function stepPayload(step: any): {table: string; columns: any[]} {
  return typeof step.table === 'object' ? step.table : step;
}

const migrationList: any[] = (migrations as any).migrations;

describe('database schema and migrations agree', () => {
  it('schema version equals the highest migration toVersion', () => {
    const maxToVersion = Math.max(...migrationList.map(m => m.toVersion));
    expect((schema as any).version).toBe(maxToVersion);
  });

  it('migration toVersions are contiguous and start at 2', () => {
    const versions = migrationList.map(m => m.toVersion).sort((a, b) => a - b);
    expect(versions[0]).toBe(2);
    versions.forEach((version, index) => {
      expect(version).toBe(index + 2);
    });
  });

  it('every added column exists in the schema with a matching definition', () => {
    const tables: Record<string, any> = {};
    for (const table of (schema as any).tables) {
      tables[table.name] = table;
    }

    for (const migration of migrationList) {
      for (const step of migration.steps) {
        if (step.type !== 'add_columns') {
          continue;
        }
        const {table, columns} = stepPayload(step);

        expect(tables[table]).toBeDefined();

        for (const column of columns) {
          const declared = tables[table].columns.find(
            (c: any) => c.name === column.name,
          );
          expect(declared).toBeDefined();
          expect(declared.type).toBe(column.type);
          expect(Boolean(declared.isOptional)).toBe(Boolean(column.isOptional));
        }
      }
    }
  });

  it('declares pinned on chat_sessions as a non-optional boolean', () => {
    const chatSessions = (schema as any).tables.find(
      (t: any) => t.name === 'chat_sessions',
    );
    const pinned = chatSessions.columns.find((c: any) => c.name === 'pinned');

    expect(pinned).toEqual({name: 'pinned', type: 'boolean'});
  });
});
