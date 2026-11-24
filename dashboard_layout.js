// ====================================================
// DASHBOARD LAYOUT - 2-SPALTEN VORSCHAU + DND + HIDE + RESET + UPDATE
// ====================================================
if ('admin_dashboard' === (typeof getUrlQueryParameterValue === 'function' ? getUrlQueryParameterValue('page') : new URLSearchParams(window.location.search).get('page'))) {
    (function startLayoutPlugin() {
        if (!window.jQuery) {
            setTimeout(startLayoutPlugin, 50);
            return;
        }

        window.jQuery(function($) {
            const LAYOUT_ENDPOINT = 'dashboard-layout/dashboard_layout.php';
            const htmlLang = ($('html').attr('lang') || 'de').trim();
            const isGerman = htmlLang.toLowerCase().startsWith('de');
            const langCode = (htmlLang.toLowerCase().replace(/[^a-z-]/g, '').split('-')[0] || 'de').slice(0, 5);

            const FIXED_CARD_SELECTORS = [
                '#ramdisk-status-card',
                '#real-cpu-status-card',
                '#abuseipdb-status-card',
                '#plugin-stats-card',
                '#custom-service-box-0-card'
            ];

            let savedHiddenSet = new Set();
            let cachedLayoutData = null;
            let cachedGitInfo = null;
            let currentCsrfToken = '';

            function escapeHtml(val) {
                return $('<div>').text(String(val ?? '')).html();
            }

            function buildUpdateTooltip(gitInfo, latestVer) {
                const commits = Array.isArray(gitInfo && gitInfo.commits) ? gitInfo.commits : [];
                const header = isGerman
                    ? `Update auf ${latestVer} per git pull`
                    : `Update to ${latestVer} via git pull`;

                if (!commits.length) {
                    return header;
                }

                const listTitle = isGerman ? 'Änderungen:' : 'Changes:';
                const lines = commits.map(function(c) {
                    return '• ' + String(c || '').trim();
                }).filter(Boolean);

                return [header, '', listTitle, ...lines].join('\n');
            }

            function renderOverlayFooterHtml(gitInfo) {
                if (!gitInfo || typeof gitInfo !== 'object') {
                    return '';
                }

                const mode = gitInfo.mode || 'git';
                const currentVer = escapeHtml(gitInfo.current_version || '-');
                const latestVer = escapeHtml(gitInfo.latest_version || currentVer);
                const hasUpdate = Boolean(gitInfo.has_update);

                const verLabel = isGerman
                    ? `Installierte Version: <strong style="color:#f3f4f6;">${currentVer}</strong>`
                    : `Installed version: <strong style="color:#f3f4f6;">${currentVer}</strong>`;

                let updateHtml = '';
                if (mode === 'wget') {
                    if (hasUpdate) {
                        const safeRelUrl = escapeHtml(gitInfo.release_url || 'https://github.com/NicoMSH-plugins/keyhelp-dashboard-layout-customizer/releases');
                        const labelText = isGerman
                            ? `Neue Version verfügbar (${latestVer})`
                            : `New version available (${latestVer})`;
                        const hintText = isGerman ? 'Release öffnen' : 'Open release';
                        updateHtml = `
                            <span style="color: #86efac; font-weight: 600;">${labelText}</span>
                            <a href="${safeRelUrl}" target="_blank" rel="noopener noreferrer"
                                style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px; font-size: 11px; font-weight: 600; color: #86efac; background: rgba(34, 197, 94, 0.14); border: 1px solid rgba(34, 197, 94, 0.38); text-decoration: none;">
                                <i class="fas fa-external-link-alt"></i>
                                <span>${hintText}</span>
                            </a>
                        `;
                    } else {
                        updateHtml = `<span style="opacity: 0.85;">• ${isGerman ? 'Aktuelle Version' : 'Up to date'}</span>`;
                    }
                } else {
                    if (hasUpdate) {
                        const commits = Array.isArray(gitInfo.commits) ? gitInfo.commits : [];
                        const tooltipText = buildUpdateTooltip(gitInfo, latestVer);
                        const hasCommits = commits.length > 0;
                        updateHtml = `
                            <span style="color: #86efac; font-weight: 600;">
                                ${isGerman ? `Neue Version verfügbar (${latestVer})` : `New version available (${latestVer})`}
                            </span>
                            <button type="button" id="dash-layout-git-update-btn" title="${escapeHtml(tooltipText)}"
                                style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px; font-size: 11px; font-weight: 600; color: #86efac; background: rgba(34, 197, 94, 0.14); border: 1px solid rgba(34, 197, 94, 0.38); cursor: pointer;">
                                <i class="fas fa-sync-alt"></i>
                                <span>Update</span>
                                ${hasCommits ? `<i class="fas fa-list-ul" style="opacity: 0.8;"></i>` : ''}
                            </button>
                        `;
                    } else {
                        updateHtml = `<span style="opacity: 0.85;">• ${isGerman ? 'Aktuelle Version' : 'Up to date'}</span>`;
                    }
                }

                const leftIcon = mode === 'wget' ? 'fas fa-download' : 'fab fa-git-alt';

                return `
                    <div id="dash-layout-version-footer"
                        style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.12); font-size: 12px; color: #9ca3af;">
                        <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <i class="${leftIcon}"></i>
                            <span>${verLabel}</span>
                            ${updateHtml}
                        </div>
                        <div id="dash-layout-update-error" style="color: #fca5a5; font-size: 11px;"></div>
                    </div>
                `;
            }

            function updateFooterButtonBadge() {
                const $btn = $('#edit-dashboard-layout-btn');
                if (!$btn.length) return;
                const hasUpdate = Boolean(cachedGitInfo && cachedGitInfo.has_update);
                if (hasUpdate && !$btn.find('.dash-layout-upd-dot').length) {
                    const ver = escapeHtml(cachedGitInfo.latest_version || '');
                    const badgeTitle = isGerman ? `Update verfügbar (${ver})` : `Update available (${ver})`;
                    $btn.append(
                        `<span class="dash-layout-upd-dot" title="${badgeTitle}" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:700;background:rgba(34,197,94,0.18);color:#86efac;border:1px solid rgba(34,197,94,0.4);">Update</span>`
                    );
                }
            }

            function slugifyTitle(text) {
                return (text || '')
                    .toLowerCase()
                    .trim()
                    .replace(/ä/g, 'ae')
                    .replace(/ö/g, 'oe')
                    .replace(/ü/g, 'ue')
                    .replace(/ß/g, 'ss')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 48);
            }

            function getDashboardColumns() {
                let $columnsWrapper = $('#plugin-stats-card').closest('.columns');

                if (!$columnsWrapper.length) {
                    $columnsWrapper = $('.columns').filter(function() {
                        const $cols = $(this).children('.column');
                        return $cols.length >= 2 && $cols.find('> .card, > .box').length > 0;
                    }).first();
                }

                let $columns = $columnsWrapper.length
                    ? $columnsWrapper.children('.column')
                    : $('main, .section, .container').first();

                const usedIds = new Set();
                $columns.find('> .card, > .box').each(function() {
                    const existingId = $(this).attr('id');
                    if (existingId) usedIds.add(existingId);
                });

                $columns.find('> .card, > .box').each(function(idx) {
                    const $el = $(this);
                    if ($el.is(FIXED_CARD_SELECTORS.join(',')) && $el.attr('id')) {
                        return;
                    }
                    if (!$el.attr('id')) {
                        const title = $el.find('.card-header-title, h1, h2, h3, h4').first().text().trim();
                        const baseSlug = slugifyTitle(title) || ('box-' + idx);
                        let candidate = 'dash-box-' + baseSlug;
                        let counter = 2;
                        while (usedIds.has(candidate)) {
                            candidate = 'dash-box-' + baseSlug + '-' + counter;
                            counter++;
                        }
                        usedIds.add(candidate);
                        $el.attr('id', candidate);
                    }
                });

                return $columns;
            }

            function getCardTitle($card) {
                const rawTitle = $card.find('.card-header-title, h1, h2, h3, h4').first().text().trim();
                if (rawTitle) return rawTitle;
                return $card.attr('id') || 'Box';
            }

            function getCardSummary($card, isMarkedHidden) {
                if (isMarkedHidden) {
                    return isGerman ? 'Wird auf dem Dashboard ausgeblendet' : 'Hidden on dashboard';
                }
                const $content = $card.find('.card-content, .box-content, .content').first();
                const text = ($content.length ? $content.text() : $card.text())
                    .replace(/\s+/g, ' ')
                    .trim();
                const title = getCardTitle($card);
                const cleaned = text.startsWith(title) ? text.slice(title.length).trim() : text;
                if (!cleaned) return isGerman ? 'Dashboard-Box' : 'Dashboard box';
                return cleaned.length > 85 ? cleaned.slice(0, 85).trim() + '…' : cleaned;
            }

            function applyHiddenState($columns, hiddenIds) {
                const hiddenSet = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
                $columns.find('> .card, > .box').each(function() {
                    const $card = $(this);
                    const id = $card.attr('id');
                    if (!id) return;
                    if (hiddenSet.has(id)) {
                        $card.hide();
                    } else if (savedHiddenSet.has(id)) {
                        $card.show();
                    }
                });
                savedHiddenSet = hiddenSet;
            }

            function applySavedLayout(layoutData) {
                if (!layoutData) return;
                const columnsOrder = Array.isArray(layoutData) ? layoutData : (layoutData && layoutData.columns);
                const hiddenIds = Array.isArray(layoutData) ? [] : (layoutData && layoutData.hidden);

                const $columns = getDashboardColumns();
                if (!$columns.length) return;

                if (Array.isArray(columnsOrder) && columnsOrder.length) {
                    const cardMap = new Map();
                    $columns.find('> .card, > .box').each(function() {
                        cardMap.set($(this).attr('id'), $(this));
                    });

                    columnsOrder.forEach(function(colIds, colIndex) {
                        if (!Array.isArray(colIds)) return;
                        const $targetCol = $columns.eq(colIndex).length ? $columns.eq(colIndex) : $columns.last();
                        colIds.forEach(function(id) {
                            const $card = cardMap.get(id);
                            if ($card && $card.length) {
                                $targetCol.append($card);
                            }
                        });
                    });
                }

                if (Array.isArray(hiddenIds)) {
                    applyHiddenState($columns, hiddenIds);
                }

                $columns.each(function() {
                    const $firstVisible = $(this).children('.card, .box').filter(function() {
                        return $(this).is(':visible');
                    }).first();
                    if ($firstVisible.length) {
                        $firstVisible.css('marginTop', '0px');
                    }
                });

                $columns.find('> .card, > .box').filter(function() {
                    return $(this).is(':visible');
                }).each(function() {
                    const currentMb = parseFloat($(this).css('marginBottom')) || 0;
                    if (currentMb < 24) {
                        $(this).css('marginBottom', '24px');
                    }
                });
            }

            function sendLayoutRequest(payload, onDone, onError) {
                const requestPayload = Object.assign({}, payload, { lang: langCode });
                if (currentCsrfToken) {
                    requestPayload.csrf_token = currentCsrfToken;
                }

                const ajaxOpts = {
                    url: LAYOUT_ENDPOINT + '?lang=' + encodeURIComponent(langCode),
                    method: 'POST',
                    contentType: 'application/json; charset=utf-8',
                    data: JSON.stringify(requestPayload),
                    dataType: 'json'
                };
                if (currentCsrfToken) {
                    ajaxOpts.headers = { 'X-CSRF-Token': currentCsrfToken };
                }

                $.ajax(ajaxOpts)
                .done(function(res) {
                    if (res && res.csrf_token) {
                        currentCsrfToken = String(res.csrf_token);
                    }
                    if (res && res.ok) {
                        if (typeof onDone === 'function') onDone(res);
                    } else {
                        if (typeof onError === 'function') onError(res && res.error ? res.error : 'Request failed');
                    }
                })
                .fail(function(jqXHR) {
                    const serverErr = jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.error;
                    if (typeof onError === 'function') onError(serverErr || ('HTTP ' + (jqXHR.status || 'Error')));
                });
            }

            function setTileHiddenVisual($tile, isHidden) {
                $tile.attr('data-hidden', isHidden ? '1' : '0');
                if (isHidden) {
                    $tile.css({ background: 'rgba(31, 41, 55, 0.55)', border: '1px dashed rgba(245,158,11,0.45)', opacity: '0.82' });
                    $tile.find('.dash-tile-badge').html(
                        `<span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(245,158,11,0.16); color: #fcd34d; border: 1px solid rgba(245,158,11,0.35); white-space: nowrap;">${isGerman ? 'Ausgeblendet' : 'Hidden'}</span>`
                    );
                    $tile.find('.dash-tile-toggle').text(isGerman ? 'Einblenden' : 'Show');
                } else {
                    $tile.css({
                        background: '#1f2937',
                        border: '1px solid rgba(156,163,175,0.28)',
                        opacity: '1'
                    });
                    $tile.find('.dash-tile-badge').empty();
                    $tile.find('.dash-tile-toggle').text(isGerman ? 'Ausblenden' : 'Hide');
                }
            }

            function buildTileHtml($card) {
                const id = $card.attr('id');
                const title = getCardTitle($card);
                const isHidden = $card.is(':hidden') || savedHiddenSet.has(id);
                const summary = getCardSummary($card, isHidden);

                const hiddenBadge = isHidden
                    ? `<span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(245,158,11,0.16); color: #fcd34d; border: 1px solid rgba(245,158,11,0.35); white-space: nowrap;">${isGerman ? 'Ausgeblendet' : 'Hidden'}</span>`
                    : '';

                const tileStyle = isHidden
                    ? 'background: rgba(31, 41, 55, 0.55); border: 1px dashed rgba(245,158,11,0.45); border-radius: 8px; padding: 11px 14px; cursor: grab; user-select: none; display: flex; flex-direction: column; justify-content: space-between; min-height: 76px; opacity: 0.82; transition: border-color 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;'
                    : 'background: #1f2937; border: 1px solid rgba(156,163,175,0.28); border-radius: 8px; padding: 11px 14px; cursor: grab; user-select: none; display: flex; flex-direction: column; justify-content: space-between; min-height: 76px; transition: border-color 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;';

                const toggleLabel = isHidden
                    ? (isGerman ? 'Einblenden' : 'Show')
                    : (isGerman ? 'Ausblenden' : 'Hide');

                return `
                    <div class="dash-preview-tile" data-card-id="${id}" data-hidden="${isHidden ? '1' : '0'}" draggable="true" style="${tileStyle}">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span style="font-size: 13px; font-weight: 600; color: #f3f4f6;">
                                <span style="opacity: 0.6; margin-right: 6px;">⋮⋮</span>${title}
                            </span>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="dash-tile-badge">${hiddenBadge}</span>
                                <button type="button" class="dash-tile-toggle"
                                    style="padding: 2px 8px; font-size: 11px; border-radius: 5px; border: 1px solid rgba(156,163,175,0.3); background: rgba(255,255,255,0.05); color: #e5e7eb; cursor: pointer; white-space: nowrap;">
                                    ${toggleLabel}
                                </button>
                            </div>
                        </div>
                        <div class="dash-tile-summary" style="font-size: 11px; color: #9ca3af; margin-top: 5px; line-height: 1.35;">
                            ${summary}
                        </div>
                    </div>
                `;
            }

            function openPreviewOverlay() {
                if ($('#dash-layout-overlay').length) return;

                const $columns = getDashboardColumns();
                const colCount = $columns.length;
                const isNarrow = window.innerWidth < 820;

                const columnsHtml = $columns.map(function(colIdx) {
                    const $col = $(this);
                    const $allCards = $col.children('.card, .box');

                    const colLabel = colCount === 2
                        ? (colIdx === 0
                            ? (isGerman ? 'Linke Spalte' : 'Left Column')
                            : (isGerman ? 'Rechte Spalte' : 'Right Column'))
                        : ((isGerman ? 'Spalte ' : 'Column ') + (colIdx + 1));

                    const tilesHtml = $allCards.map(function() {
                        return buildTileHtml($(this));
                    }).get().join('');

                    return `
                        <div style="display: flex; flex-direction: column; min-width: 0;">
                            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; margin-bottom: 8px; padding-left: 4px;">
                                ${colLabel}
                            </div>
                            <div class="dash-preview-col" data-col-index="${colIdx}"
                                style="display: flex; flex-direction: column; gap: 9px; min-height: 180px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.025); border: 1px dashed rgba(156,163,175,0.22);">
                                ${tilesHtml}
                            </div>
                        </div>
                    `;
                }).get().join('');

                const gridCols = (colCount >= 2 && !isNarrow) ? `repeat(${colCount}, minmax(0, 1fr))` : '1fr';
                const versionFooterHtml = renderOverlayFooterHtml(cachedGitInfo);

                const overlayHtml = `
                    <div id="dash-layout-overlay"
                        style="position: fixed; top: 24px; right: 24px; bottom: 24px; left: 24px; max-width: 1060px; margin: 0 auto; z-index: 99999; background: rgba(15, 20, 32, 0.98); border: 1px solid rgba(156,163,175,0.28); border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; flex-direction: column; padding: 20px 24px; box-sizing: border-box;">
                        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.12);">
                            <div>
                                <div style="font-size: 15px; font-weight: 700; color: #f9fafb;">
                                    ${isGerman ? 'Dashboard-Layout Vorschau' : 'Dashboard Layout Preview'}
                                </div>
                                <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">
                                    ${isGerman
                                        ? 'Boxen per Drag & Drop verschieben oder über Ausblenden/Einblenden umschalten.'
                                        : 'Drag & drop boxes or toggle visibility with Hide/Show.'}
                                </div>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
                                <span id="dash-layout-status" style="font-size: 12px; color: #fca5a5;"></span>
                                <button type="button" id="dash-layout-reset"
                                    style="padding: 7px 12px; font-size: 13px; border-radius: 6px; border: 1px solid rgba(248,113,113,0.4); background: rgba(239,68,68,0.08); color: #fca5a5; cursor: pointer;">
                                    ${isGerman ? 'Zurücksetzen' : 'Reset'}
                                </button>
                                <button type="button" id="dash-layout-cancel"
                                    style="padding: 7px 14px; font-size: 13px; border-radius: 6px; border: 1px solid rgba(156,163,175,0.35); background: transparent; color: #e5e7eb; cursor: pointer;">
                                    ${isGerman ? 'Abbrechen' : 'Cancel'}
                                </button>
                                <button type="button" id="dash-layout-save"
                                    style="padding: 7px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; background: #3b82f6; color: #ffffff; cursor: pointer;">
                                    ${isGerman ? 'Speichern & Neu laden' : 'Save & Reload'}
                                </button>
                            </div>
                        </div>

                        <div id="dash-preview-board" style="margin-top: 14px; overflow-y: auto; flex: 1; padding-right: 4px;">
                            <div style="display: grid; grid-template-columns: ${gridCols}; gap: 16px; align-items: start;">
                                ${columnsHtml}
                            </div>
                        </div>

                        ${versionFooterHtml}
                    </div>
                `;

                const $overlay = $(overlayHtml);
                $('body').append($overlay);

                $overlay.on('click', '#dash-layout-git-update-btn', function(e) {
                    e.preventDefault();
                    const $btn = $(this);
                    if ($btn.prop('disabled')) return;

                    $btn.prop('disabled', true);
                    $btn.find('i').first().addClass('fa-spin');
                    $btn.find('span').text(isGerman ? 'Aktualisiere...' : 'Updating...');
                    $('#dash-layout-update-error').text('');

                    if (!currentCsrfToken) {
                        $btn.prop('disabled', false);
                        $btn.find('i').first().removeClass('fa-spin');
                        $btn.find('span').text('Update');
                        $('#dash-layout-update-error').text(isGerman ? 'Kein CSRF-Token vorhanden.' : 'Missing CSRF token.');
                        return;
                    }

                    $.ajax({
                        url: LAYOUT_ENDPOINT + '?action=update',
                        method: 'POST',
                        headers: { 'X-CSRF-Token': currentCsrfToken },
                        dataType: 'json'
                    }).done(function(res) {
                        if (res && res.ok) {
                            window.location.reload();
                            return;
                        }
                        const msg = (res && res.error) ? res.error : (isGerman ? 'Update fehlgeschlagen.' : 'Update failed.');
                        $btn.prop('disabled', false);
                        $btn.find('i').first().removeClass('fa-spin');
                        $btn.find('span').text('Update');
                        $('#dash-layout-update-error').text(msg);
                    }).fail(function(jqXHR) {
                        const errDetail = (jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.error)
                            ? jqXHR.responseJSON.error
                            : (isGerman ? 'Update fehlgeschlagen.' : 'Update failed.');
                        $btn.prop('disabled', false);
                        $btn.find('i').first().removeClass('fa-spin');
                        $btn.find('span').text('Update');
                        $('#dash-layout-update-error').text(errDetail);
                    });
                });

                $overlay.on('click', '.dash-tile-toggle', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const $tile = $(this).closest('.dash-preview-tile');
                    const currentlyHidden = $tile.attr('data-hidden') === '1';
                    const nextHidden = !currentlyHidden;
                    setTileHiddenVisual($tile, nextHidden);

                    const cardId = $tile.attr('data-card-id');
                    const $sourceCard = $('#' + $.escapeSelector(cardId));
                    $tile.find('.dash-tile-summary').text(
                        getCardSummary($sourceCard.length ? $sourceCard : $tile, nextHidden)
                    );
                });

                let $draggedTile = null;

                function clearTileIndicators() {
                    $overlay.find('.dash-preview-tile').css('boxShadow', 'none');
                }

                $overlay.on('dragstart', '.dash-preview-tile', function(e) {
                    if ($(e.target).closest('.dash-tile-toggle').length) { e.preventDefault(); return; }
                    $draggedTile = $(this);
                    $draggedTile.css({ opacity: '0.45', borderColor: '#60a5fa' });
                    if (e.originalEvent && e.originalEvent.dataTransfer) {
                        e.originalEvent.dataTransfer.effectAllowed = 'move';
                        e.originalEvent.dataTransfer.setData('text/plain', $draggedTile.attr('data-card-id') || '');
                    }
                });

                $overlay.on('dragover', '.dash-preview-tile', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!$draggedTile) return;
                    const $target = $(this);
                    if ($target[0] === $draggedTile[0]) return;

                    clearTileIndicators();
                    const rect = this.getBoundingClientRect();
                    const after = (e.originalEvent.clientY - rect.top) > (rect.height / 2);
                    if (after) {
                        $target.css('boxShadow', 'inset 0 -3px 0 #60a5fa');
                        $target.after($draggedTile);
                    } else {
                        $target.css('boxShadow', 'inset 0 3px 0 #60a5fa');
                        $target.before($draggedTile);
                    }
                });

                $overlay.on('dragover', '.dash-preview-col', function(e) {
                    e.preventDefault();
                    if (!$draggedTile) return;
                    const $col = $(this);
                    if ($(e.target).hasClass('dash-preview-col')) {
                        $col.append($draggedTile);
                    }
                });

                $overlay.on('dragend', '.dash-preview-tile', function() {
                    clearTileIndicators();
                    if ($draggedTile) {
                        const isHidden = $draggedTile.attr('data-hidden') === '1';
                        setTileHiddenVisual($draggedTile, isHidden);
                    }
                    $draggedTile = null;
                });

                function closeOverlay() {
                    $(document).off('keydown.dashLayoutEsc');
                    $overlay.remove();
                }

                $(document).on('keydown.dashLayoutEsc', function(e) {
                    if (e.key === 'Escape') closeOverlay();
                });

                $overlay.on('click', '#dash-layout-cancel', closeOverlay);

                $overlay.on('click', '#dash-layout-reset', function() {
                    const msg = isGerman
                        ? 'Gespeichertes Dashboard-Layout wirklich löschen und auf Standard zurücksetzen?'
                        : 'Delete saved dashboard layout and reset to default?';
                    if (!window.confirm(msg)) return;

                    const $resetBtn = $(this);
                    $resetBtn.prop('disabled', true);
                    $('#dash-layout-status').text('');

                    sendLayoutRequest(
                        { reset: true },
                        function() {
                            window.location.reload();
                        },
                        function(errMsg) {
                            $resetBtn.prop('disabled', false);
                            $('#dash-layout-status').text(
                                (isGerman ? 'Fehler beim Zurücksetzen: ' : 'Reset error: ') + errMsg
                            );
                        }
                    );
                });

                $overlay.on('click', '#dash-layout-save', function() {
                    const $saveBtn = $(this);
                    const newColumns = [];
                    const hiddenIds = [];

                    $overlay.find('.dash-preview-col').each(function() {
                        const colIds = [];
                        $(this).find('.dash-preview-tile').each(function() {
                            const $tile = $(this);
                            const id = $tile.attr('data-card-id');
                            if (id) {
                                colIds.push(id);
                                if ($tile.attr('data-hidden') === '1') {
                                    hiddenIds.push(id);
                                }
                            }
                        });
                        newColumns.push(colIds);
                    });

                    $saveBtn.prop('disabled', true).text(isGerman ? 'Speichere...' : 'Saving...');
                    $('#dash-layout-status').text('');

                    sendLayoutRequest(
                        { columns: newColumns, hidden: hiddenIds },
                        function() {
                            window.location.reload();
                        },
                        function(errMsg) {
                            $saveBtn.prop('disabled', false).text(isGerman ? 'Speichern & Neu laden' : 'Save & Reload');
                            $('#dash-layout-status').text(
                                (isGerman ? 'Fehler beim Speichern: ' : 'Save error: ') + errMsg
                            );
                        }
                    );
                });
            }

            function ensureFooterButton() {
                if ($('#edit-dashboard-layout-btn').length) {
                    updateFooterButtonBadge();
                    return true;
                }

                const label = isGerman ? 'Layout bearbeiten' : 'Edit Layout';
                const $footerAnchor = $('.svg-footer-icon').first().closest('p').parent();
                const $fallbackAnchor = $('a[href*="keyhelp.de"]').last().closest('p').parent();
                const $footer = $footerAnchor.length
                    ? $footerAnchor
                    : ($fallbackAnchor.length ? $fallbackAnchor : ($('footer.footer, footer').first()));

                const $btn = $(`
                    <button type="button" id="edit-dashboard-layout-btn"
                        style="display: inline-block; margin-top: 8px; padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid rgba(156,163,175,0.35); background: rgba(255,255,255,0.04); color: #d1d5db; cursor: pointer;">
                        ${label}
                    </button>
                `);

                $btn.on('click', openPreviewOverlay);

                if ($footer.length) {
                    $footer.append($btn);
                    updateFooterButtonBadge();
                    return true;
                }
                return false;
            }

            ensureFooterButton();
            let btnRetries = 0;
            const btnRetryTimer = setInterval(function() {
                btnRetries++;
                if (ensureFooterButton() || btnRetries >= 15) {
                    if (btnRetries >= 15 && !$('#edit-dashboard-layout-btn').length) {
                        const label = isGerman ? 'Layout bearbeiten' : 'Edit Layout';
                        const $btn = $(`
                            <button type="button" id="edit-dashboard-layout-btn"
                                style="position: fixed; right: 16px; bottom: 16px; z-index: 9990; padding: 6px 12px; font-size: 12px; border-radius: 6px; border: 1px solid rgba(156,163,175,0.35); background: rgba(15,23,42,0.92); color: #f8fafc; cursor: pointer;">
                                ${label}
                            </button>
                        `).on('click', openPreviewOverlay);
                        $('body').append($btn);
                        updateFooterButtonBadge();
                    }
                    clearInterval(btnRetryTimer);
                }
            }, 300);

            $(document).on('pluginStatsBoxReady ramdiskBoxReady', function() {
                ensureFooterButton();
                if (cachedLayoutData) {
                    applySavedLayout(cachedLayoutData);
                }
            });

            document.addEventListener('customServiceBoxesReady', function() {
                ensureFooterButton();
                if (cachedLayoutData) {
                    applySavedLayout(cachedLayoutData);
                }
            });

            function pickLayoutForLang(rawRes, currentLang) {
                if (!rawRes) return null;
                if (rawRes.locales && typeof rawRes.locales === 'object') {
                    if (rawRes.locales[currentLang]) return rawRes.locales[currentLang];
                    if (rawRes.locales.de) return rawRes.locales.de;
                    const firstKey = Object.keys(rawRes.locales)[0];
                    if (firstKey) return rawRes.locales[firstKey];
                }
                if (Array.isArray(rawRes.columns) || Array.isArray(rawRes.hidden)) {
                    const hasData = (Array.isArray(rawRes.columns) && rawRes.columns.some(c => Array.isArray(c) && c.length > 0))
                        || (Array.isArray(rawRes.hidden) && rawRes.hidden.length > 0);
                    if (hasData) return rawRes;
                }
                return null;
            }

            $.getJSON(LAYOUT_ENDPOINT + '?lang=' + encodeURIComponent(langCode) + '&_=' + Date.now())
                .done(function(res) {
                    if (res && res.csrf_token) {
                        currentCsrfToken = String(res.csrf_token);
                    }
                    if (res && res.git) {
                        cachedGitInfo = res.git;
                        updateFooterButtonBadge();
                    }
                    const chosen = pickLayoutForLang(res, langCode);
                    if (chosen) {
                        cachedLayoutData = chosen;
                        applySavedLayout(chosen);
                        setTimeout(function() {
                            applySavedLayout(chosen);
                        }, 500);
                        setTimeout(function() {
                            applySavedLayout(chosen);
                        }, 1500);
                    }
                })
                .always(function() {
                    ensureFooterButton();
                });
        });
    })();
}