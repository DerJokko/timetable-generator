const events = [...document.querySelectorAll('.event')];
const filters = [...document.querySelectorAll('.filter')];
const status = document.querySelector('#status');
const selected = new Set();
let activeFilter = null;

function kindOf(event) {
    if (event.dataset.kind) return event.dataset.kind;
    const label = event.innerText.match(/\b(VL|UE)\b/);
    return label ? label[1] : 'GP';
}

function placementOf(event) {
    const style = event.style;
    return {
        day: Number(style.gridColumnStart),
        rowStart: Number(style.gridRowStart),
        rowEnd: Number(style.gridRowEnd)
    };
}

function overlaps(first, second) {
    const a = placementOf(first);
    const b = placementOf(second);
    return a.day === b.day && a.rowStart < b.rowEnd && b.rowStart < a.rowEnd;
}

function layoutOverlaps() {
    const byDay = new Map();
    events.forEach(event => {
        const { day } = placementOf(event);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(event);
    });

    byDay.forEach(dayEvents => {
        dayEvents.sort((a, b) => placementOf(a).rowStart - placementOf(b).rowStart);
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
        const chosenAlternative = kind === 'UE' && [...selected].some(chosen => chosen !== event && chosen.dataset.course === event.dataset.course && kindOf(chosen) === kind);
        event.classList.toggle('selected', selected.has(event));
        event.classList.toggle('same-kind', chosenAlternative);
        event.classList.toggle('dimmed', Boolean(activeFilter && event.dataset.course !== activeFilter));
        event.setAttribute('aria-pressed', String(selected.has(event)));
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
            const selectedCount = courseEvents.filter(event => selected.has(event)).length;
            if (kind === 'VL') return `VL ${selectedCount}/${courseEvents.length}`;
            const label = kind === 'GP' ? 'Praktikum' : kind;
            return `${label} ${selectedCount ? '✓' : '–'}`;
        }).join(' / ');
        return `<b>${course}</b>: ${progress}`;
    }).join(' &nbsp; · &nbsp; ');
    status.innerHTML = selected.size ? summary : 'Noch keine Veranstaltung ausgewählt. ' + summary;
}

events.forEach(event => {
    event.tabIndex = 0;
    event.setAttribute('role', 'button');
    event.addEventListener('click', () => {
        const kind = kindOf(event);
        if (selected.has(event)) {
            selected.delete(event);
        } else {
            const replaces = kind === 'UE'
                ? [...selected].filter(chosen => chosen.dataset.course === event.dataset.course && kindOf(chosen) === 'UE')
                : [];
            const conflict = [...selected].find(chosen => {
                return !replaces.includes(chosen) && overlaps(event, chosen) && !(kind === 'VL' && kindOf(chosen) === 'VL');
            });
            if (conflict) {
                status.textContent = `Zeitkonflikt: ${event.dataset.course} ${kindOf(event)} überschneidet sich mit ${conflict.dataset.course} ${kindOf(conflict)}. Für diesen Zeitslot kann nur ein Kurs gewählt werden.`;
                return;
            }
            replaces.forEach(chosen => selected.delete(chosen));
            selected.add(event);
        }
        render();
    });
    event.addEventListener('keydown', keyboardEvent => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
            keyboardEvent.preventDefault();
            event.click();
        }
    });
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
    activeFilter = null;
    render();
});

function exportScheduleAsPng() {
    const schedule = document.querySelector('#schedule');
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

    const originX = scheduleRect.left;
    const originY = scheduleRect.top;
    [...schedule.children].forEach(element => {
        const rect = element.getBoundingClientRect();
        const x = padding + rect.left - originX;
        const y = titleHeight + rect.top - originY;
        const style = getComputedStyle(element);
        const text = element.innerText.trim();
        if (!text && !element.classList.contains('cell')) return;

        context.save();
        context.globalAlpha = Number(style.opacity) || (style.opacity === '0' ? 0 : 1);
        context.fillStyle = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : style.backgroundColor;
        context.fillRect(x, y, rect.width, rect.height);
        context.strokeStyle = style.borderRightColor || '#b8b8b8';
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));

        if (text) {
            const fontSize = Number.parseFloat(style.fontSize) || 14;
            const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
            const weight = style.fontWeight === '700' || Number(style.fontWeight) >= 600 ? '700' : '400';
            context.font = `${weight} ${fontSize}px ${style.fontFamily}`;
            context.fillStyle = style.color;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            const maxWidth = Math.max(12, rect.width - 12);
            const lines = text.split(/\r?\n/).flatMap(line => {
                const words = line.trim().split(/\s+/).filter(Boolean);
                if (!words.length) return [''];
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
            lines.forEach((line, index) => context.fillText(line, x + rect.width / 2, y + (rect.height - textHeight) / 2 + index * lineHeight + lineHeight / 2, maxWidth));
        }
        if (element.classList.contains('selected')) {
            context.strokeStyle = '#111111';
            context.lineWidth = 3;
            context.strokeRect(x + 2, y + 2, rect.width - 4, rect.height - 4);
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

layoutOverlaps();
render();
