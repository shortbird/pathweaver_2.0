"""
Database connection module for Render PostgreSQL
This replaces the Supabase client with direct PostgreSQL connections
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

class DatabaseConnection:
    """Manages PostgreSQL connections with connection pooling"""
    
    def __init__(self, database_url=None):
        self.database_url = database_url or os.environ.get('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL not configured")
            
        # Fix Render's postgres:// to postgresql://
        if self.database_url.startswith('postgres://'):
            self.database_url = self.database_url.replace('postgres://', 'postgresql://')
            
        # Create connection pool
        self.pool = SimpleConnectionPool(
            1,  # Min connections
            20,  # Max connections
            self.database_url
        )
        
    @contextmanager
    def get_connection(self):
        """Get a connection from the pool"""
        conn = self.pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self.pool.putconn(conn)
            
    @contextmanager
    def get_cursor(self, dict_cursor=True):
        """Get a cursor with automatic connection management"""
        with self.get_connection() as conn:
            cursor_factory = RealDictCursor if dict_cursor else None
            cursor = conn.cursor(cursor_factory=cursor_factory)
            try:
                yield cursor
            finally:
                cursor.close()
                
    def execute_query(self, query, params=None, fetch='all'):
        """Execute a query and return results"""
        with self.get_cursor() as cursor:
            cursor.execute(query, params)
            
            if fetch == 'one':
                return cursor.fetchone()
            elif fetch == 'all':
                return cursor.fetchall()
            elif fetch == 'none':
                return cursor.rowcount
            else:
                return cursor.fetchmany(fetch)
                
    def execute_insert(self, query, params, returning=True):
        """Execute an insert query"""
        with self.get_cursor() as cursor:
            cursor.execute(query, params)
            if returning:
                return cursor.fetchone()
            return cursor.rowcount
            
    def execute_update(self, query, params):
        """Execute an update query"""
        return self.execute_query(query, params, fetch='none')
        
    def execute_delete(self, query, params):
        """Execute a delete query"""
        return self.execute_query(query, params, fetch='none')
        
    def close(self):
        """Close all connections in the pool"""
        self.pool.closeall()

# Global database instance
db = None

def init_db(app=None):
    """Initialize the database connection"""
    global db
    database_url = os.environ.get('DATABASE_URL')
    if app:
        database_url = app.config.get('DATABASE_URL', database_url)
    db = DatabaseConnection(database_url)
    return db

def get_db():
    """Get the global database instance"""
    global db
    if db is None:
        db = init_db()
    return db

# Helper functions that match Supabase client pattern
class DatabaseClient:
    """Wrapper to provide Supabase-like interface"""
    
    def __init__(self):
        self.db = get_db()
        
    def table(self, table_name):
        """Return a table query builder"""
        return TableQueryBuilder(self.db, table_name)

class TableQueryBuilder:
    """Query builder for table operations"""
    
    def __init__(self, db, table_name):
        self.db = db
        self.table_name = table_name
        self.filters = []
        self.select_columns = '*'
        self.order_by_clause = None
        self.limit_clause = None
        
    def select(self, columns='*'):
        """Select specific columns"""
        self.select_columns = columns
        return self
        
    def insert(self, data):
        """Insert data into table"""
        if isinstance(data, dict):
            data = [data]
            
        if not data:
            return self
            
        # Build insert query
        columns = list(data[0].keys())
        placeholders = ', '.join(['%s'] * len(columns))
        column_names = ', '.join(columns)
        
        query = f"""
            INSERT INTO {self.table_name} ({column_names})
            VALUES ({placeholders})
            RETURNING *
        """
        
        results = []
        for row in data:
            values = [row.get(col) for col in columns]
            result = self.db.execute_insert(query, values)
            results.append(result)
            
        return {'data': results[0] if len(results) == 1 else results, 'error': None}
        
    def update(self, data):
        """Update data in table"""
        if not data or not self.filters:
            return {'data': None, 'error': 'No data or filters provided'}
            
        # Build update query
        set_clause = ', '.join([f"{k} = %s" for k in data.keys()])
        where_clause = ' AND '.join(self.filters)
        
        query = f"""
            UPDATE {self.table_name}
            SET {set_clause}
            WHERE {where_clause}
            RETURNING *
        """
        
        values = list(data.values())
        result = self.db.execute_query(query, values, fetch='all')
        
        return {'data': result, 'error': None}
        
    def delete(self):
        """Delete data from table"""
        if not self.filters:
            return {'data': None, 'error': 'No filters provided for delete'}
            
        where_clause = ' AND '.join(self.filters)
        query = f"DELETE FROM {self.table_name} WHERE {where_clause} RETURNING *"
        
        result = self.db.execute_query(query, fetch='all')
        return {'data': result, 'error': None}
        
    def eq(self, column, value):
        """Add equality filter"""
        self.filters.append(f"{column} = '{value}'")
        return self
        
    def neq(self, column, value):
        """Add not equal filter"""
        self.filters.append(f"{column} != '{value}'")
        return self
        
    def gt(self, column, value):
        """Add greater than filter"""
        self.filters.append(f"{column} > '{value}'")
        return self
        
    def gte(self, column, value):
        """Add greater than or equal filter"""
        self.filters.append(f"{column} >= '{value}'")
        return self
        
    def lt(self, column, value):
        """Add less than filter"""
        self.filters.append(f"{column} < '{value}'")
        return self
        
    def lte(self, column, value):
        """Add less than or equal filter"""
        self.filters.append(f"{column} <= '{value}'")
        return self
        
    def in_(self, column, values):
        """Add IN filter"""
        values_str = ', '.join([f"'{v}'" for v in values])
        self.filters.append(f"{column} IN ({values_str})")
        return self
        
    def is_(self, column, value):
        """Add IS filter (for NULL checks)"""
        if value is None:
            self.filters.append(f"{column} IS NULL")
        else:
            self.filters.append(f"{column} IS {value}")
        return self
        
    def order(self, column, desc=False):
        """Add order by clause"""
        direction = 'DESC' if desc else 'ASC'
        self.order_by_clause = f"ORDER BY {column} {direction}"
        return self
        
    def limit(self, count):
        """Add limit clause"""
        self.limit_clause = f"LIMIT {count}"
        return self
        
    def execute(self):
        """Execute the built query"""
        # Build the query
        where_clause = f"WHERE {' AND '.join(self.filters)}" if self.filters else ""
        
        query = f"""
            SELECT {self.select_columns}
            FROM {self.table_name}
            {where_clause}
            {self.order_by_clause or ''}
            {self.limit_clause or ''}
        """
        
        result = self.db.execute_query(query.strip(), fetch='all')
        return {'data': result, 'error': None}

# Create a global client instance
client = None

def get_client():
    """Get the database client with Supabase-like interface"""
    global client
    if client is None:
        client = DatabaseClient()
    return client