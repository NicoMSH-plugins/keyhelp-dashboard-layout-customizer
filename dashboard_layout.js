// ====================================================
// DASHBOARD LAYOUT - 2-SPALTEN VORSCHAU + DND + HIDE + RESET
// ====================================================
if ('admin_dashboard' === getUrlQueryParameterValue('page')) {
    $(function() {
        const LAYOUT_ENDPOINT = 'dashboard-layout/dashboard_layout.php';
        const htmlLang = $('html').attr('lang') || '';
        const isGerman = htmlLang.toLowerCase().startsWith('de');

        let savedHiddenSet = new Set();

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
            let $columnsWrapper =$('#plugin-stats-card').closest('.columns');

            if (!$columnsWrapper.length) {
                $columnsWrapper =$('.columns').filter(function() {
                    const $cols =$(this).children('.column');
                    return $cols.length >= 2 &&$cols.find('> .card, > .box').length > 0;
                }).first();
            }

            let $columns =$columnsWrapper.length
                ? $columnsWrapper.children('.column')
                : $('main, .section, .container').first();

            const usedIds = new Set();
            $columns.find('> .card, > .box').each(function() {
                const existingId = $(this).attr('id');
                if (existingId) usedIds.add(existingId);
            });

            $columns.find('> .card, > .box').each(function(idx) {
                const $el =$(this);
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
            const $content =$card.find('.card-content, .box-content, .content').first();
            const text = ($content.length ? $content.text() :$card.text())
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
                const $card =$(this);
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
            const columnsOrder = Array.isArray(layoutData) ? layoutData : (layoutData && layoutData.columns);
            const hiddenIds = Array.isArray(layoutData) ? [] : (layoutData && layoutData.hidden);

            const $columns = getDashboardColumns();
            if (!$columns.length) return;

            if (Array.isArray(columnsOrder) && columnsOrder.length) {
                const cardMap = new Map();
                $columns.find('> .card, > .box').each(function() {
                    cardMap.set($(this).attr('id'),$(this));
                });

                columnsOrder.forEach(function(colIds, colIndex) {
                    if (!Array.isArray(colIds)) return;
                    const $targetCol =$columns.eq(colIndex).length ? $columns.eq(colIndex) :$columns.last();
                    colIds.forEach(function(id) {
                        const $card = cardMap.get(id);
                        if ($card &&$card.length) {
                            $targetCol.append($card);
                        }
                    });
                });
            }

            if (Array.isArray(hiddenIds)) {
                applyHiddenState($columns, hiddenIds);
            }

            $columns.each(function() {
                const $firstVisible =$(this).children('.card, .box').filter(function() {
                    return $(this).is(':visible');
                }).first();
                if ($firstVisible.length) {$firstVisible.css('marginTop', '0px');
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
            $.ajax({
                url: LAYOUT_ENDPOINT,
                method: 'POST',
                contentType: 'application/json; charset=utf-8',
                data: JSON.stringify(payload),
                dataType: 'json'
            })
            .done(function(res) {
                if (res && res.ok) {
                    if (typeof onDone === 'function') onDone(res);
                } else {
                    if (typeof onError === 'function') onError(res && res.error ? res.error : 'Request failed');
                }
            })
            .fail(function(jqXHR) {
                if (typeof onError === 'function') onError('HTTP ' + (jqXHR.status || 'Error'));
            });
        }

        function setTileHiddenVisual($tile, isHidden) {$tile.attr('data-hidden', isHidden ? '1' : '0');
            if (isHidden) {
                $tile.css({ background: 'rgba(31, 41, 55, 0.55)', border: '1px dashed rgba(245,158,11,0.45)', opacity: '0.82' });$tile.find('.dash-tile-badge').html(
                    `<span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(245,158,11,0.16); color: #fcd34d; border: 1px solid rgba(245,158,11,0.35); white-space: nowrap;">${isGerman ? 'Ausgeblendet' : 'Hidden'}</span>`
                );
                $tile.find('.dash-tile-toggle').text(isGerman ? 'Einblenden' : 'Show');
            } else {
                $tile.css({
                    background: '#1f2937',
                    border: '1px solid rgba(156,163,175,0.28)',
                    opacity: '1'
                });
                $tile.find('.dash-tile-badge').empty();$tile.find('.dash-tile-toggle').text(isGerman ? 'Ausblenden' : 'Hide');
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
                const $col =$(this);
                const $allCards =$col.children('.card, .box');

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
                </div>
            `;

            const $overlay =$(overlayHtml);
            $('body').append($overlay);

            // Ausblenden / Einblenden auf Kachel-Ebene
            $overlay.on('click', '.dash-tile-toggle', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const $tile =$(this).closest('.dash-preview-tile');
                const currentlyHidden = $tile.attr('data-hidden') === '1';
                const nextHidden = !currentlyHidden;
                setTileHiddenVisual($tile, nextHidden);

                const cardId = $tile.attr('data-card-id');
                const $sourceCard = $('#' + $.escapeSelector(cardId));
                $tile.find('.dash-tile-summary').text(
                    getCardSummary($sourceCard.length ? $sourceCard :$tile, nextHidden)
                );
            });

            let $draggedTile = null;

            function clearTileIndicators() {
                $overlay.find('.dash-preview-tile').css('boxShadow', 'none');
            }

            $overlay.on('dragstart', '.dash-preview-tile', function(e) {
                if ($(e.target).closest('.dash-tile-toggle').length) { e.preventDefault(); return; }$draggedTile = $(this);$draggedTile.css({ opacity: '0.45', borderColor: '#60a5fa' });
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.effectAllowed = 'move';
                    e.originalEvent.dataTransfer.setData('text/plain', $draggedTile.attr('data-card-id') || '');
                }
            });

            $overlay.on('dragover', '.dash-preview-tile', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (!$draggedTile) return;
                const $target =$(this);
                if ($target[0] ===$draggedTile[0]) return;

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
                const $col =$(this);
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
                $(document).off('keydown.dashLayoutEsc');$overlay.remove();
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

                const $resetBtn =$(this);
                $resetBtn.prop('disabled', true);$('#dash-layout-status').text('');

                sendLayoutRequest(
                    { reset: true },
                    function() {
                        window.location.reload();
                    },
                    function(errMsg) {
                        $resetBtn.prop('disabled', false);$('#dash-layout-status').text(
                            (isGerman ? 'Fehler beim Zurücksetzen: ' : 'Reset error: ') + errMsg
                        );
                    }
                );
            });

            $overlay.on('click', '#dash-layout-save', function() {
                const $saveBtn =$(this);
                const newColumns = [];
                const hiddenIds = [];

                $overlay.find('.dash-preview-col').each(function() {
                    const colIds = [];
                    $(this).find('.dash-preview-tile').each(function() {
                        const $tile =$(this);
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
            if ($('#edit-dashboard-layout-btn').length) return;

            const label = isGerman ? 'Layout bearbeiten' : 'Edit Layout';
            const $footerAnchor =$('.svg-footer-icon').first().closest('p').parent();
            const $fallbackAnchor =$('a[href*="keyhelp.de"]').last().closest('p').parent();
            const $footer =$footerAnchor.length
                ? $footerAnchor
                : ($fallbackAnchor.length ? $fallbackAnchor : ($('footer.footer, footer').first()));

            const $btn =$(`
                <button type="button" id="edit-dashboard-layout-btn"
                    style="display: inline-block; margin-top: 8px; padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid rgba(156,163,175,0.35); background: rgba(255,255,255,0.04); color: #d1d5db; cursor: pointer;">
                    ${label}
                </button>
            `);

            $btn.on('click', openPreviewOverlay);

            if ($footer.length) {
                $footer.append($btn);
            } else {
                $('body').append($btn);
            }
        }

        $.getJSON(LAYOUT_ENDPOINT + '?_=' + Date.now())
            .done(function(res) {
                if (res && (Array.isArray(res.columns) || Array.isArray(res.hidden))) {
                    applySavedLayout(res);
                    setTimeout(function() {
                        applySavedLayout(res);
                    }, 500);
                }
            })
            .always(function() {
                setTimeout(function() {
                    ensureFooterButton();
                }, 400);
            });
    });
}