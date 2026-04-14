from flask import Flask, jsonify, request, render_template
import sqlite3
import os
from datetime import datetime, date

app = Flask(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'app.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority INTEGER DEFAULT 3,
            duration_hours REAL DEFAULT 1.0,
            deadline TEXT DEFAULT NULL,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS calendar_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            todo_id INTEGER NOT NULL,
            entry_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()

# ── TODOS ──────────────────────────────────────────────────────────────────────

@app.route('/api/todos', methods=['GET'])
def get_todos():
    conn = get_db()
    todos = conn.execute('SELECT * FROM todos ORDER BY priority DESC, created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(t) for t in todos])

@app.route('/api/todos', methods=['POST'])
def create_todo():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO todos (title, description, priority, duration_hours, deadline)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        data.get('title', 'Neues ToDo'),
        data.get('description', ''),
        data.get('priority', 3),
        data.get('duration_hours', 1.0),
        data.get('deadline', None)
    ))
    todo_id = c.lastrowid
    conn.commit()
    todo = conn.execute('SELECT * FROM todos WHERE id = ?', (todo_id,)).fetchone()
    conn.close()
    return jsonify(dict(todo)), 201

@app.route('/api/todos/<int:todo_id>', methods=['PUT'])
def update_todo(todo_id):
    data = request.json
    conn = get_db()
    fields = []
    values = []
    for field in ['title', 'description', 'priority', 'duration_hours', 'deadline', 'completed']:
        if field in data:
            fields.append(f'{field} = ?')
            values.append(data[field])
    if fields:
        values.append(todo_id)
        conn.execute(f'UPDATE todos SET {", ".join(fields)} WHERE id = ?', values)
        conn.commit()
    todo = conn.execute('SELECT * FROM todos WHERE id = ?', (todo_id,)).fetchone()
    conn.close()
    return jsonify(dict(todo))

@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
def delete_todo(todo_id):
    conn = get_db()
    conn.execute('DELETE FROM calendar_entries WHERE todo_id = ?', (todo_id,))
    conn.execute('DELETE FROM todos WHERE id = ?', (todo_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── CALENDAR ───────────────────────────────────────────────────────────────────

@app.route('/api/calendar', methods=['GET'])
def get_calendar():
    # Auto-clean past entries (keep today)
    today = date.today().isoformat()
    conn = get_db()
    conn.execute("DELETE FROM calendar_entries WHERE entry_date < ?", (today,))
    conn.commit()
    
    # Optional: filter by date range
    start = request.args.get('start')
    end = request.args.get('end')
    
    query = '''
        SELECT ce.*, t.title, t.priority, t.duration_hours, t.completed
        FROM calendar_entries ce
        JOIN todos t ON ce.todo_id = t.id
    '''
    params = []
    if start and end:
        query += ' WHERE ce.entry_date BETWEEN ? AND ?'
        params = [start, end]
    query += ' ORDER BY ce.entry_date, ce.start_time'
    
    entries = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(e) for e in entries])

@app.route('/api/calendar', methods=['POST'])
def create_calendar_entry():
    data = request.json
    todo_id = data.get('todo_id')
    entry_date = data.get('entry_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    conn = get_db()
    # Check for existing entries for this todo on this date
    existing = conn.execute(
        'SELECT id FROM calendar_entries WHERE todo_id = ? AND entry_date = ?',
        (todo_id, entry_date)
    ).fetchall()
    
    if existing:
        conn.close()
        return jsonify({'conflict': True, 'count': len(existing)}), 409
    
    c = conn.cursor()
    c.execute('''
        INSERT INTO calendar_entries (todo_id, entry_date, start_time, end_time)
        VALUES (?, ?, ?, ?)
    ''', (todo_id, entry_date, start_time, end_time))
    entry_id = c.lastrowid
    conn.commit()
    
    entry = conn.execute('''
        SELECT ce.*, t.title, t.priority, t.duration_hours, t.completed
        FROM calendar_entries ce JOIN todos t ON ce.todo_id = t.id
        WHERE ce.id = ?
    ''', (entry_id,)).fetchone()
    conn.close()
    return jsonify(dict(entry)), 201

@app.route('/api/calendar/<int:entry_id>', methods=['PUT'])
def update_calendar_entry(entry_id):
    data = request.json
    conn = get_db()
    fields = []
    values = []
    for field in ['entry_date', 'start_time', 'end_time']:
        if field in data:
            fields.append(f'{field} = ?')
            values.append(data[field])
    if fields:
        values.append(entry_id)
        conn.execute(f'UPDATE calendar_entries SET {", ".join(fields)} WHERE id = ?', values)
        conn.commit()
    entry = conn.execute('''
        SELECT ce.*, t.title, t.priority, t.duration_hours, t.completed
        FROM calendar_entries ce JOIN todos t ON ce.todo_id = t.id
        WHERE ce.id = ?
    ''', (entry_id,)).fetchone()
    conn.close()
    return jsonify(dict(entry))

@app.route('/api/calendar/<int:entry_id>', methods=['DELETE'])
def delete_calendar_entry(entry_id):
    conn = get_db()
    conn.execute('DELETE FROM calendar_entries WHERE id = ?', (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/calendar/force', methods=['POST'])
def force_create_calendar_entry():
    data = request.json
    todo_id = data.get('todo_id')
    entry_date = data.get('entry_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    conn = get_db()
    # Remove existing entries for this todo on this date
    conn.execute('DELETE FROM calendar_entries WHERE todo_id = ? AND entry_date = ?',
                 (todo_id, entry_date))
    
    c = conn.cursor()
    c.execute('''
        INSERT INTO calendar_entries (todo_id, entry_date, start_time, end_time)
        VALUES (?, ?, ?, ?)
    ''', (todo_id, entry_date, start_time, end_time))
    entry_id = c.lastrowid
    conn.commit()
    
    entry = conn.execute('''
        SELECT ce.*, t.title, t.priority, t.duration_hours, t.completed
        FROM calendar_entries ce JOIN todos t ON ce.todo_id = t.id
        WHERE ce.id = ?
    ''', (entry_id,)).fetchone()
    conn.close()
    return jsonify(dict(entry)), 201

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    init_db()
    print("🚀 Todo & Kalender App läuft auf http://localhost:5000")
    app.run(debug=True, port=5000)
