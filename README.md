# KeyHelp Dashboard Layout Customizer

A lightweight drag-and-drop layout and visibility manager for the KeyHelp admin dashboard (admin_dashboard), persisted server-side via a small PHP endpoint (dashboard_layout.json).

<img width="800" height="408" alt="demo" src="https://github.com/user-attachments/assets/3730030b-c8c0-4909-9236-9f2d0d58b04c" />

> [!IMPORTANT]
>
> **Requirements**
>
> - **Panel:** KeyHelp admin dashboard (admin_dashboard) with `jQuery` available.
> - **PHP & Web Access:** PHP endpoint (dashboard_layout.php) reachable under `dashboard-layout/` with write/delete permissions for `dashboard_layout.json`.
> - **Permissions:** Directory and scripts owned by `keyhelp:keyhelp` so `dashboard_layout.json` can be created, updated, and removed on reset.

***

## Features

- Drag and drop dashboard boxes up/down or between columns inside a compact preview modal.
- Hide or show individual dashboard boxes directly inside the preview modal.
- Persist column order and hidden box IDs server-side in dashboard_layout.json.
- Reset the saved layout with one click to restore the default KeyHelp dashboard.
- Automatic German / English UI labels based on the html lang attribute.

***

## File Structure

```text
dashboard-layout/
├── dashboard_layout.php   # Backend API (GET, POST, Reset) & JSON persistence
└── dashboard_layout.js    # Frontend preview modal, drag-and-drop & layout logic
```

***

## Step-by-Step Installation

### Step 1: Create Directory & Download Files

Create the target directory inside KeyHelp and download the files via wget (replace YOUR_REPO_URL with your raw GitHub base URL if needed):

```bash
mkdir -p /home/keyhelp/www/keyhelp/dashboard-layout
cd /home/keyhelp/www/keyhelp/dashboard-layout

wget -O dashboard_layout.php https://raw.githubusercontent.com/mulano1977/keyhelp-dashboard-layout-customizer/releases/download/1.0.0/dashboard_layout.php
wget -O dashboard_layout.js https://raw.githubusercontent.com/mulano1977/keyhelp-dashboard-layout-customizer/releases/download/1.0.0/dashboard_layout.js
```

### Step 2: Set Ownership and Permissions

Set ownership to `keyhelp:keyhelp` and apply standard file/directory permissions so `dashboard_layout.json` can be written and deleted cleanly:

```
chown -R keyhelp:keyhelp /home/keyhelp/www/keyhelp/dashboard-layout
chmod 755 /home/keyhelp/www/keyhelp/dashboard-layout
chmod 644 /home/keyhelp/www/keyhelp/dashboard-layout/dashboard_layout.php /home/keyhelp/www/keyhelp/dashboard-layout/dashboard_layout.js
```

### Step 3: Add the Loader in KeyHelp White-Label JavaScript

Open your KeyHelp admin panel, go to White-Label -> JavaScript, and add the following snippet:

```
if ('admin_dashboard' === getUrlQueryParameterValue('page')) {
    $(function() {
        $.getScript('dashboard-layout/dashboard_layout.js?_=' + Date.now());
    });
}
```

Save the White-Label settings.

### Step 4: Test in the KeyHelp Dashboard

1. Open the KeyHelp Dashboard.
2. Click Edit Layout in the footer area.
3. Drag boxes up/down or between columns, and use Hide / Show if needed.
4. Click Save & Reload to store the layout in `dashboard_layout.json`, or click Reset to remove it and restore defaults.

***

> [!NOTE]
> Some dashboard widgets load or adjust asynchronously; therefore the script reapplies the saved layout on initial load and once shortly after.
