const schedule = document.querySelector('#schedule');
const filters = [...document.querySelectorAll('.filter')];
const status = document.querySelector('#status');
const conflictDialog = document.querySelector('#conflict-dialog');
const conflictMessage = document.querySelector('#conflict-message');
const conflictEvents = document.querySelector('#conflict-events');
const cancelConflict = document.querySelector('#cancel-conflict');
const confirmConflict = document.querySelector('#confirm-conflict');
const selected = new Set();
const selectedGroups = new Map();
let events = [];
let activeFilter = null;
let pendingSelection = null;

const courseColors = {
    'Ex I': { VL: 'var(--blue)', UE: 'var(--lightblue)' },
    'Ana I': { VL: 'var(--green)', UE: 'var(--lime)', Tutorium: 'var(--lime)' },
    RM: { VL: '#f5f53d', UE: 'var(--yellow)' },
    LA: { VL: 'var(--orange)', UE: '#f8c39a' },
    Grundpraktikum: { Praktikum: 'var(--purple)' }
};

function validateEvents(data) {
    if (!Array.isArray(data)) throw new Error('events.json muss eine Terminliste enthalten.');
    data.forEach((event, index) => {
        const prefix = `Termin ${index + 1}`;
        if (typeof event.Name !== 'string' || !event.Name.trim()) throw new Error(`${prefix}: Name fehlt.`);
        if (typeof event.Art !== 'string' || !event.Art.trim()) throw new Error(`${prefix}: Art fehlt.`);
        if (!Array.isArray(event.Gruppe) || !event.Gruppe.every(group => typeof group === 'string')) {
            throw new Error(`${prefix}: Gruppe muss eine Liste von Textwerten sein.`);
        }
        if (typeof event.Anmerkung !== 'string') throw new Error(`${prefix}: Anmerkung muss Text sein.`);
        if (!Number.isInteger(event.Tag) || event.Tag < 1 || event.Tag > 5) {
            throw new Error(`${prefix}: Tag muss eine Zahl von 1 bis 5 sein.`);
        }
        if (!Number.isInteger(event.StundeVon) || !Number.isInteger(event.StundeBis)
            || event.StundeVon < 1 || event.StundeBis > 12 || event.StundeVon > event.StundeBis) {
            throw new Error(`${prefix}: Stundenbereich muss zwischen 1 und 12 liegen und gültig sein.`);
        }
    });
}

function buildEvent(record) {
    const event = document.createElement('div');
    event.className = 'event';
    event.dataset.course = record.Name;
    event.dataset.kind = record.Art;
    event.dataset.group = record.Gruppe.length === 1 ? record.Gruppe[0] : '';
    event.style.gridColumn = String(record.Tag + 1);
    event.style.gridRow = `${record.StundeVon + 1} / ${record.StundeBis + 2}`;
    event.style.background = courseColors[record.Name]?.[record.Art] || '#ddd';
    if (record.Anmerkung) event.title = record.Anmerkung;

    const name = document.createElement('span');
    name.className = 'event-name';
    name.textContent = record.Name;
    event.append(name);

    const kind = document.createElement('span');
    kind.className = 'event-kind';
    kind.textContent = record.Art;
    event.append(kind);

    if (record.Gruppe.length > 1) {
        event.classList.add('has-group-options');
        event.setAttribute('role', 'group');
        event.setAttribute('aria-label', `${record.Name} ${record.Art} – Gruppe wählen`);
        const options = document.createElement('div');
        options.className = 'group-options';
        options.setAttribute('aria-label', 'Gruppe wählen');
        record.Gruppe.forEach(group => {
            const option = document.createElement('button');
            option.className = 'group-option';
            option.type = 'button';
            option.textContent = group;
            option.dataset.group = group;
            option.setAttribute('aria-label', `Gruppe ${group} auswählen`);
            option.setAttribute('aria-pressed', 'false');
            option.addEventListener('click', clickEvent => {
                clickEvent.stopPropagation();
                chooseEvent(event, group);
            });
            options.append(option);
        });
        event.append(options);
    } else if (record.Gruppe.length === 1) {
        const group = document.createElement('span');
        group.className = 'event-group';
        group.textContent = record.Gruppe[0];
        event.append(group);
    }

    if (record.Anmerkung) {
        const note = document.createElement('small');
        note.className = 'event-note';
        note.textContent = record.Anmerkung;
        event.append(note);
    }

    if (record.Gruppe.length <= 1) {
        event.tabIndex = 0;
        event.setAttribute('role', 'button');
    }
    event.addEventListener('click', () => {
        if (selected.has(event)) {
            selected.delete(event);
            selectedGroups.delete(event);
            render();
        } else {
            chooseEvent(event, event.dataset.group || undefined);
        }
    });
    if (record.Gruppe.length <= 1) {
        event.addEventListener('keydown', keyboardEvent => {
            if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                keyboardEvent.preventDefault();
                event.click();
            }
        });
    }
    return event;
}

function kindOf(event) {
    return event.dataset.kind;
}

function placementOf(event) {
    return {
        day: Number(event.style.gridColumnStart),
        rowStart: Number(event.style.gridRowStart),
        rowEnd: Number(event.style.gridRowEnd)
    };
}

function overlaps(first, second) {
    const a = placementOf(first);
    const b = placementOf(second);
    return a.day === b.day && a.rowStart < b.rowEnd && b.rowStart < a.rowEnd;
}

function chooseEvent(event, group) {
    const kind = kindOf(event);
    const replaces = kind === 'UE'
        ? [...selected].filter(chosen => chosen.dataset.course === event.dataset.course && kindOf(chosen) === kind)
        : [];
    const conflicts = [...selected].filter(chosen => {
        return !replaces.includes(chosen) && overlaps(event, chosen) && !(kind === 'VL' && kindOf(chosen) === 'VL');
    });
    if (conflicts.length) {
        pendingSelection = { event, group, replaces };
        conflictMessage.textContent = `${event.dataset.course} ${kind}${group ? ` (Gruppe ${group})` : ''} überschneidet sich mit Deiner Auswahl:`;
        conflictEvents.replaceChildren(...conflicts.map(conflict => {
            const item = document.createElement('li');
            const selectedGroup = selectedGroups.get(conflict);
            item.textContent = `${conflict.dataset.course} ${kindOf(conflict)}${selectedGroup ? ` (Gruppe ${selectedGroup})` : ''}`;
            return item;
        }));
        conflictDialog.showModal();
        return;
    }
    commitSelection(event, group, replaces);
}

function commitSelection(event, group, replaces) {
    replaces.forEach(chosen => {
        selected.delete(chosen);
        selectedGroups.delete(chosen);
    });
    selected.add(event);
    if (group) selectedGroups.set(event, group);
    else selectedGroups.delete(event);
    render();
}

function layoutOverlaps() {
    const byDay = new Map();
    const lanePriority = { VL: 0, Tutorium: 1, UE: 2 };
    events.forEach(event => {
        const { day } = placementOf(event);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(event);
    });

    byDay.forEach(dayEvents => {
        dayEvents.sort((a, b) => {
            const startDifference = placementOf(a).rowStart - placementOf(b).rowStart;
            if (startDifference) return startDifference;
            return (lanePriority[kindOf(a)] ?? 3) - (lanePriority[kindOf(b)] ?? 3);
        });
        let cluster = [];
        let clusterEnd = -Infinity;
        const layoutCluster = () => {
            if (!cluster.length) return;
            const laneEnds = [];
            cluster.forEach(event => {
                const { rowStart, rowEnd } = placementOf(event);
                let lane = laneEnds.findIndex(end => end <= rowStart);
                if (lane === -1) lane = laneEnds.length;
                laneEnds[lane] = rowEnd;
                event.style.setProperty('--lane', lane);
            });
            const laneCount = laneEnds.length;
            cluster.forEach(event => {
                const lane = Number(event.style.getPropertyValue('--lane'));
                event.style.setProperty('--lane-width', `calc(100% / ${laneCount} - 4px)`);
                event.style.setProperty('--lane-offset', `${lane * 100 / laneCount}%`);
            });
            cluster = [];
            clusterEnd = -Infinity;
        };

        dayEvents.forEach(event => {
            const { rowStart, rowEnd } = placementOf(event);
            if (cluster.length && rowStart >= clusterEnd) layoutCluster();
            cluster.push(event);
            clusterEnd = Math.max(clusterEnd, rowEnd);
        });
        layoutCluster();
    });
}

function render() {
    events.forEach(event => {
        const kind = kindOf(event);
        const chosenAlternative = kind === 'UE' && [...selected].some(chosen => {
            return chosen !== event && chosen.dataset.course === event.dataset.course && kindOf(chosen) === kind;
        });
        event.classList.toggle('selected', selected.has(event));
        event.classList.toggle('same-kind', chosenAlternative);
        event.classList.toggle('dimmed', Boolean(activeFilter && event.dataset.course !== activeFilter));
        event.querySelectorAll('.group-option').forEach(option => {
            const isSelected = selected.has(event) && selectedGroups.get(event) === option.dataset.group;
            option.classList.toggle('active', isSelected);
            option.setAttribute('aria-pressed', String(isSelected));
        });
        if (event.getAttribute('role') === 'button') event.setAttribute('aria-pressed', String(selected.has(event)));
    });
    filters.forEach(filter => filter.classList.toggle('active', filter.dataset.course === activeFilter));

    const requirements = new Map();
    events.forEach(event => {
        const course = event.dataset.course;
        if (!requirements.has(course)) requirements.set(course, new Set());
        requirements.get(course).add(kindOf(event));
    });
    const summary = [...requirements].map(([course, kinds]) => {
        const progress = [...kinds].map(kind => {
            const courseEvents = events.filter(event => event.dataset.course === course && kindOf(event) === kind);
            const chosenEvent = courseEvents.find(event => selected.has(event));
            const selectedCount = courseEvents.filter(event => selected.has(event)).length;
            if (kind === 'VL') return `VL ${selectedCount}/${courseEvents.length}`;
            const label = kind === 'Praktikum' ? 'Praktikum' : kind;
            const group = chosenEvent && selectedGroups.get(chosenEvent);
            return `${label}${group ? ` ${group}` : ''} ${selectedCount ? '✓' : '–'}`;
        }).join(' / ');
        return `<b>${course}</b>: ${progress}`;
    }).join(' &nbsp; · &nbsp; ');
    status.innerHTML = selected.size ? summary : 'Noch keine Veranstaltung ausgewählt. ' + summary;
}

cancelConflict.addEventListener('click', () => conflictDialog.close());
confirmConflict.addEventListener('click', () => {
    if (!pendingSelection) return;
    const { event, group, replaces } = pendingSelection;
    pendingSelection = null;
    conflictDialog.close();
    commitSelection(event, group, replaces);
});
conflictDialog.addEventListener('close', () => {
    pendingSelection = null;
});

filters.forEach(filter => filter.addEventListener('click', () => {
    activeFilter = activeFilter === filter.dataset.course ? null : filter.dataset.course;
    render();
}));

document.querySelector('#select-all-vl').addEventListener('click', () => {
    events.filter(event => kindOf(event) === 'VL').forEach(event => selected.add(event));
    activeFilter = null;
    render();
});

document.querySelector('#reset').addEventListener('click', () => {
    selected.clear();
    selectedGroups.clear();
    activeFilter = null;
    render();
});

function drawText(context, text, rect, style, originX, originY, alpha = 1) {
    const x = 16 + rect.left - originX;
    const y = 58 + rect.top - originY;
    const fontSize = Number.parseFloat(style.fontSize) || 14;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
    const weight = Number(style.fontWeight) >= 600 || style.fontWeight === 'bold' ? '700' : '400';
    context.save();
    context.globalAlpha *= alpha;
    context.font = `${weight} ${fontSize}px ${style.fontFamily}`;
    context.fillStyle = style.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const maxWidth = Math.max(12, rect.width - 8);
    const lines = text.split(/\r?\n/).flatMap(line => {
        const words = line.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const wrapped = [];
        let current = '';
        words.forEach(word => {
            const candidate = current ? `${current} ${word}` : word;
            if (current && context.measureText(candidate).width > maxWidth) {
                wrapped.push(current);
                current = word;
            } else {
                current = candidate;
            }
        });
        wrapped.push(current);
        return wrapped;
    });
    const textHeight = lines.length * lineHeight;
    lines.forEach((line, index) => {
        context.fillText(line, x + rect.width / 2, y + (rect.height - textHeight) / 2 + index * lineHeight + lineHeight / 2, maxWidth);
    });
    context.restore();
}

function exportScheduleAsPng() {
    const legend = document.querySelector('.legend');
    const scheduleRect = schedule.getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();
    const scale = 2;
    const padding = 16;
    const titleHeight = 58;
    const width = Math.max(schedule.scrollWidth, scheduleRect.width);
    const height = titleHeight + schedule.scrollHeight + legendRect.height + padding * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((width + padding * 2) * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
        status.textContent = 'PNG-Export ist in diesem Browser nicht verfügbar.';
        return;
    }

    context.scale(scale, scale);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width + padding * 2, height);
    context.fillStyle = '#171717';
    context.font = '700 22px Arial, Helvetica, sans-serif';
    context.fillText(document.querySelector('h1').innerText, padding, 28);
    context.fillStyle = '#666666';
    context.font = '14px Arial, Helvetica, sans-serif';
    context.fillText(document.querySelector('.subtitle').innerText, padding, 48);

    [...schedule.children].forEach(element => {
        const rect = element.getBoundingClientRect();
        const x = padding + rect.left - scheduleRect.left;
        const y = titleHeight + rect.top - scheduleRect.top;
        const style = getComputedStyle(element);
        const isEvent = element.classList.contains('event');
        const text = element.innerText.trim();
        if (!text && !element.classList.contains('cell')) return;

        context.save();
        context.globalAlpha = Number(style.opacity) || (style.opacity === '0' ? 0 : 1);
        context.fillStyle = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : style.backgroundColor;
        context.fillRect(x, y, rect.width, rect.height);
        context.strokeStyle = style.borderRightColor || '#b8b8b8';
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));

        if (isEvent) {
            [...element.children].forEach(child => {
                if (child.classList.contains('group-options')) {
                    [...child.children].forEach(option => {
                        const optionRect = option.getBoundingClientRect();
                        const optionStyle = getComputedStyle(option);
                        const unselected = selected.has(element) && selectedGroups.get(element) !== option.dataset.group;
                        const optionX = padding + optionRect.left - scheduleRect.left;
                        const optionY = titleHeight + optionRect.top - scheduleRect.top;
                        context.save();
                        if (unselected) context.globalAlpha *= 0.25;
                        context.fillStyle = optionStyle.backgroundColor;
                        context.fillRect(optionX, optionY, optionRect.width, optionRect.height);
                        context.strokeStyle = optionStyle.borderColor;
                        context.strokeRect(optionX + 0.5, optionY + 0.5, optionRect.width - 1, optionRect.height - 1);
                        drawText(context, option.textContent, optionRect, optionStyle, scheduleRect.left, scheduleRect.top);
                        context.restore();
                    });
                } else {
                    drawText(context, child.textContent, child.getBoundingClientRect(), getComputedStyle(child), scheduleRect.left, scheduleRect.top);
                }
            });
            if (element.classList.contains('selected')) {
                context.strokeStyle = '#111111';
                context.lineWidth = 3;
                context.strokeRect(x + 2, y + 2, rect.width - 4, rect.height - 4);
            }
        } else if (text) {
            drawText(context, text, rect, style, scheduleRect.left, scheduleRect.top);
        }
        context.restore();
    });

    const legendY = titleHeight + schedule.scrollHeight + 14;
    [...legend.children].forEach(item => {
        const dot = item.querySelector('.dot');
        const dotRect = dot.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const x = padding + itemRect.left - legendRect.left;
        const y = legendY + dotRect.top - legendRect.top;
        const dotStyle = getComputedStyle(dot);
        context.fillStyle = dotStyle.backgroundColor;
        context.fillRect(x, y, dotRect.width, dotRect.height);
        context.strokeStyle = dotStyle.borderColor;
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, dotRect.width - 1, dotRect.height - 1);
        context.fillStyle = '#444444';
        context.font = '13px Arial, Helvetica, sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(item.innerText.trim(), x + dotRect.width + 5, y + dotRect.height / 2);
    });

    canvas.toBlob(blob => {
        if (!blob) {
            status.textContent = 'Der PNG-Export ist fehlgeschlagen.';
            return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Stundenplan-WiSe-2627.png';
        link.click();
        URL.revokeObjectURL(link.href);
    }, 'image/png');
}

document.querySelector('#export-png').addEventListener('click', exportScheduleAsPng);

async function initialize() {
    status.textContent = 'Termine werden geladen …';
    const response = await fetch('./events.json');
    if (!response.ok) throw new Error(`events.json konnte nicht geladen werden (HTTP ${response.status}).`);
    const data = await response.json();
    validateEvents(data);
    events = data.map(buildEvent);
    schedule.append(...events);
    layoutOverlaps();
    render();
}

initialize().catch(error => {
    console.error('Stundenplan konnte nicht geladen werden:', error);
    status.textContent = `Der Stundenplan konnte nicht geladen werden: ${error.message}`;
});
