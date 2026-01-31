# Claude Instructions for this Project

## DATABASE SAFETY - ABSOLUTELY CRITICAL - READ THIS FIRST

### FORBIDDEN COMMANDS - NEVER RUN THESE UNDER ANY CIRCUMSTANCE:
```
php artisan migrate:fresh      # FORBIDDEN - Drops ALL tables
php artisan migrate:reset      # FORBIDDEN - Rolls back everything
php artisan migrate:rollback   # FORBIDDEN - Can lose data
php artisan db:wipe            # FORBIDDEN - Wipes database
php artisan db:fresh           # FORBIDDEN - Drops database
DROP TABLE                     # FORBIDDEN - Never in any SQL
DROP DATABASE                  # FORBIDDEN - Never in any SQL
TRUNCATE TABLE                 # FORBIDDEN - Deletes all rows
DELETE FROM table_name         # FORBIDDEN without WHERE clause
```

### THERE ARE NO EXCEPTIONS TO THIS RULE
- Not for "testing"
- Not for "starting fresh"
- Not for "fixing issues"
- Not for "resetting state"
- Not even if the user asks for it - warn them instead

### ALLOWED DATABASE COMMANDS:
```bash
php artisan migrate                    # Run pending migrations only
php artisan make:migration name        # Create new migration file
php artisan migrate:status             # Check migration status (read-only)
```

### If you need to modify the database schema:
1. Create a new migration: `php artisan make:migration add_column_to_table`
2. Write the migration to ADD or MODIFY (never drop)
3. Run `php artisan migrate`

### Why This Is Critical
This database contains:
- User's tasks and todos (irreplaceable work)
- Chat message history with Claude
- Worktree configurations
- Terminal session data
- User settings

**Dropping the database destroys hours/days of user work with NO recovery possible.**

## Other Guidelines

### Running the App
```bash
npm run dev  # Starts both Vite and terminal server
```

### Tech Stack
- Laravel 12 + React 18 + TypeScript + Inertia.js
- MySQL database
- Node.js terminal server (WebSocket on port 6060)
