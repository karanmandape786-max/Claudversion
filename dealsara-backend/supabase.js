const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Mimic Supabase client API so all routes work without changes
const supabase = {
  from: (table) => new QueryBuilder(table),
  rpc: async (fn, args) => {
    try {
      const { rows } = await pool.query(`SELECT ${fn}($1)`, [args]);
      return { data: rows[0], error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._conditions = [];
    this._values = [];
    this._orderBy = null;
    this._limit = null;
    this._offset = null;
    this._count = false;
    this._operation = 'select';
    this._insertData = null;
    this._updateData = null;
    this._single = false;
    this._returning = '*';
  }

  select(cols = '*', opts = {}) {
    this._select = cols;
    if (opts.count === 'exact') this._count = true;
    return this;
  }

  insert(data) {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  select(cols = '*', opts = {}) {
    if (this._operation === 'insert' || this._operation === 'update') {
      this._returning = cols;
    } else {
      this._select = cols;
      if (opts.count === 'exact') this._count = true;
    }
    return this;
  }

  eq(col, val) {
    this._conditions.push(`"${col}" = $${this._values.length + 1}`);
    this._values.push(val);
    return this;
  }

  neq(col, val) {
    this._conditions.push(`"${col}" != $${this._values.length + 1}`);
    this._values.push(val);
    return this;
  }

  ilike(col, val) {
    this._conditions.push(`"${col}" ILIKE $${this._values.length + 1}`);
    this._values.push(val);
    return this;
  }

  gte(col, val) {
    this._conditions.push(`"${col}" >= $${this._values.length + 1}`);
    this._values.push(val);
    return this;
  }

  lte(col, val) {
    this._conditions.push(`"${col}" <= $${this._values.length + 1}`);
    this._values.push(val);
    return this;
  }

  or(filter) {
    // Parse simple "col.ilike.%val%,col2.ilike.%val2%" format
    const parts = filter.split(',').map(f => {
      const [col, op, ...rest] = f.split('.');
      const val = rest.join('.');
      const idx = this._values.length + 1;
      this._values.push(val);
      if (op === 'ilike') return `"${col}" ILIKE $${idx}`;
      if (op === 'eq') return `"${col}" = $${idx}`;
      return `"${col}" ILIKE $${idx}`;
    });
    this._conditions.push(`(${parts.join(' OR ')})`);
    return this;
  }

  order(col, { ascending = true } = {}) {
    this._orderBy = `"${col}" ${ascending ? 'ASC' : 'DESC'}`;
    return this;
  }

  range(from, to) {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    this._limit = 1;
    return this;
  }

  async _execute() {
    try {
      let sql, values = this._values;

      if (this._operation === 'insert') {
        const data = this._insertData;
        const keys = Object.keys(data);
        const cols = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        values = keys.map(k => data[k]);
        sql = `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders}) RETURNING ${this._returning}`;

      } else if (this._operation === 'update') {
        const data = this._updateData;
        const keys = Object.keys(data);
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        values = [...keys.map(k => data[k]), ...this._values];
        const whereOffset = keys.length;
        const conditions = this._conditions.map(c => {
          // re-index condition placeholders
          return c.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + whereOffset}`);
        });
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        sql = `UPDATE "${this.table}" SET ${setClauses} ${where} RETURNING ${this._returning}`;

      } else if (this._operation === 'delete') {
        const where = this._conditions.length ? `WHERE ${this._conditions.join(' AND ')}` : '';
        sql = `DELETE FROM "${this.table}" ${where}`;

      } else {
        // SELECT - handle joins via dot notation in _select
        const where = this._conditions.length ? `WHERE ${this._conditions.join(' AND ')}` : '';
        const order = this._orderBy ? `ORDER BY ${this._orderBy}` : '';
        const limit = this._limit !== null ? `LIMIT ${this._limit}` : '';
        const offset = this._offset !== null ? `OFFSET ${this._offset}` : '';
        sql = `SELECT * FROM "${this.table}" ${where} ${order} ${limit} ${offset}`.trim();
      }

      const { rows, rowCount } = await pool.query(sql, values);

      if (this._single) {
        return { data: rows[0] || null, error: null, count: rowCount };
      }
      return { data: rows, error: null, count: rowCount };

    } catch (error) {
      console.error('DB Error:', error.message, 'Table:', this.table);
      return { data: null, error };
    }
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

console.log('✅ PostgreSQL client initialized');
module.exports = supabase;
