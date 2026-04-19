from flask import Flask, jsonify, request, render_template
import sqlite3
import os
from datetime import datetime, date
import secrets
import hashlib

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
            todo_id INTEGER,
            entry_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            title TEXT DEFAULT '',
            recurrence TEXT DEFAULT 'once',
            profile TEXT DEFAULT 'me',
            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS share_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            can_edit INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
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
    today = date.today().isoformat()
    profile = request.args.get('profile', 'me')

    conn = get_db()
    # Nur einmalige vergangene Einträge löschen, wiederkehrende behalten
    conn.execute(
        "DELETE FROM calendar_entries WHERE entry_date < ? AND recurrence = 'once' AND profile = ?",
        (today, profile)
    )
    conn.commit()

    start = request.args.get('start')
    end   = request.args.get('end')

    query = '''
        SELECT ce.*,
               COALESCE(t.title, ce.title) as display_title,
               COALESCE(t.priority, 3) as priority,
               COALESCE(t.duration_hours, 1) as duration_hours,
               COALESCE(t.completed, 0) as completed
        FROM calendar_entries ce
        LEFT JOIN todos t ON ce.todo_id = t.id
        WHERE ce.profile = ?
    '''
    params = [profile]
    if start and end:
        query += ' AND ce.entry_date BETWEEN ? AND ?'
        params += [start, end]
    query += ' ORDER BY ce.entry_date, ce.start_time'

    entries = conn.execute(query, params).fetchall()
    conn.close()

    # Wiederkehrende Einträge expandieren
    result = []
    for e in entries:
        d = dict(e)
        d['title'] = d.pop('display_title')
        result.append(d)
        if d['recurrence'] == 'weekly' and start and end:
            base = date.fromisoformat(d['entry_date'])
            cur  = base + __import__('datetime').timedelta(weeks=1)
            end_d = date.fromisoformat(end)
            while cur <= end_d:
                copy = dict(d)
                copy['entry_date'] = cur.isoformat()
                copy['id'] = f"virtual_{d['id']}_{cur.isoformat()}"
                result.append(copy)
                cur += __import__('datetime').timedelta(weeks=1)
        elif d['recurrence'] == 'yearly' and start and end:
            base  = date.fromisoformat(d['entry_date'])
            end_d = date.fromisoformat(end)
            for y in range(base.year + 1, end_d.year + 2):
                try:
                    cur = base.replace(year=y)
                    if date.fromisoformat(start) <= cur <= end_d:
                        copy = dict(d)
                        copy['entry_date'] = cur.isoformat()
                        copy['id'] = f"virtual_{d['id']}_{cur.isoformat()}"
                        result.append(copy)
                except ValueError:
                    pass

    return jsonify(result)


@app.route('/api/calendar', methods=['POST'])
def create_calendar_entry():
    data    = request.json
    todo_id = data.get('todo_id')
    profile = data.get('profile', 'me')

    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM calendar_entries WHERE todo_id = ? AND entry_date = ? AND profile = ?',
        (todo_id, data.get('entry_date'), profile)
    ).fetchall() if todo_id else []

    if existing:
        conn.close()
        return jsonify({'conflict': True}), 409

    c = conn.cursor()
    c.execute('''
        INSERT INTO calendar_entries
            (todo_id, entry_date, start_time, end_time, title, recurrence, profile)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        todo_id,
        data.get('entry_date'),
        data.get('start_time'),
        data.get('end_time'),
        data.get('title', ''),
        data.get('recurrence', 'once'),
        profile
    ))
    entry_id = c.lastrowid
    conn.commit()

    entry = conn.execute('''
        SELECT ce.*,
               COALESCE(t.title, ce.title) as display_title,
               COALESCE(t.priority, 3) as priority,
               COALESCE(t.duration_hours, 1) as duration_hours,
               COALESCE(t.completed, 0) as completed
        FROM calendar_entries ce
        LEFT JOIN todos t ON ce.todo_id = t.id
        WHERE ce.id = ?
    ''', (entry_id,)).fetchone()
    conn.close()
    d = dict(entry)
    d['title'] = d.pop('display_title')
    return jsonify(d), 201


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
    data    = request.json
    todo_id = data.get('todo_id')
    profile = data.get('profile', 'me')

    conn = get_db()
    if todo_id:
        conn.execute(
            'DELETE FROM calendar_entries WHERE todo_id = ? AND entry_date = ? AND profile = ?',
            (todo_id, data.get('entry_date'), profile)
        )
    c = conn.cursor()
    c.execute('''
        INSERT INTO calendar_entries
            (todo_id, entry_date, start_time, end_time, title, recurrence, profile)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        todo_id,
        data.get('entry_date'),
        data.get('start_time'),
        data.get('end_time'),
        data.get('title', ''),
        data.get('recurrence', 'once'),
        profile
    ))
    entry_id = c.lastrowid
    conn.commit()

    entry = conn.execute('''
        SELECT ce.*,
               COALESCE(t.title, ce.title) as display_title,
               COALESCE(t.priority, 3) as priority,
               COALESCE(t.duration_hours, 1) as duration_hours,
               COALESCE(t.completed, 0) as completed
        FROM calendar_entries ce
        LEFT JOIN todos t ON ce.todo_id = t.id
        WHERE ce.id = ?
    ''', (entry_id,)).fetchone()
    conn.close()
    d = dict(entry)
    d['title'] = d.pop('display_title')
    return jsonify(d), 201

# ── SHARING ────────────────────────────────────────────────────────────────────

@app.route('/api/share/create', methods=['POST'])
def create_share_link():
    token = secrets.token_urlsafe(24)
    conn = get_db()
    conn.execute('INSERT INTO share_links (token, can_edit) VALUES (?, 1)', (token,))
    conn.commit()
    conn.close()
    return jsonify({'token': token, 'url': f'/shared/{token}'})

@app.route('/api/share/links', methods=['GET'])
def get_share_links():
    conn = get_db()
    links = conn.execute('SELECT * FROM share_links ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(l) for l in links])

@app.route('/api/share/links/<int:link_id>', methods=['DELETE'])
def delete_share_link(link_id):
    conn = get_db()
    conn.execute('DELETE FROM share_links WHERE id = ?', (link_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/shared/<token>')
def shared_view(token):
    conn = get_db()
    link = conn.execute('SELECT * FROM share_links WHERE token = ?', (token,)).fetchone()
    conn.close()
    if not link:
        return 'Link ungültig oder abgelaufen.', 404
    return render_template('index.html', share_token=token, can_edit=link['can_edit'])

# ── SETTINGS (Logo) ────────────────────────────────────────────────────────────

@app.route('/api/settings/logo', methods=['POST'])
def upload_logo():
    if 'logo' not in request.files:
        return jsonify({'error': 'Keine Datei'}), 400
    file = request.files['logo']
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ['png', 'jpg', 'jpeg', 'svg', 'webp']:
        return jsonify({'error': 'Format nicht erlaubt'}), 400
    filename = f'logo.{ext}'
    path = os.path.join(os.path.dirname(__file__), 'static', filename)
    file.save(path)
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo', ?)", (filename,))
    conn.commit()
    conn.close()
    return jsonify({'logo': f'/static/{filename}'})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    conn = get_db()
    rows = conn.execute('SELECT * FROM settings').fetchall()
    conn.close()
    return jsonify({r['key']: r['value'] for r in rows})

# ── ICS EXPORT ─────────────────────────────────────────────────────────────────

@app.route('/api/calendar/export.ics')
def export_ics():
    conn = get_db()
    entries = conn.execute('''
        SELECT ce.*, t.title, t.description
        FROM calendar_entries ce JOIN todos t ON ce.todo_id = t.id
        ORDER BY ce.entry_date, ce.start_time
    ''').fetchall()
    conn.close()

    lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0',
        'PRODID:-//Planer App//DE',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'
    ]
    for e in entries:
        dt_start = e['entry_date'].replace('-','') + 'T' + e['start_time'].replace(':','') + '00'
        dt_end   = e['entry_date'].replace('-','') + 'T' + e['end_time'].replace(':','') + '00'
        uid = hashlib.md5(f"{e['id']}{e['entry_date']}".encode()).hexdigest()
        lines += [
            'BEGIN:VEVENT',
            f"UID:{uid}@planerapp",
            f"DTSTART:{dt_start}",
            f"DTEND:{dt_end}",
            f"SUMMARY:{e['title']}",
            f"DESCRIPTION:{e['description'] or ''}",
            'END:VEVENT'
        ]
    lines.append('END:VCALENDAR')

    from flask import Response
    return Response('\r\n'.join(lines), mimetype='text/calendar',
                    headers={'Content-Disposition': 'attachment; filename=planer.ics'})

@app.route('/')
def index():
    return render_template('index.html', share_token=None, can_edit=1)

# ── PROFILES ───────────────────────────────────────────────────────────────────

PROFILES = {
    'me': {'name': 'Mein Kalender', 'color': '#a2d2ff'},
    'partner': {'name': 'Partner Kalender', 'color': '#ffafcc'}
}

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    return jsonify(PROFILES)

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    print(f"🚀 Planer App läuft auf http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
