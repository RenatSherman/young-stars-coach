/* ============================================================
   53-player-radars.js
   Радары (профиль + динамика) и загрузка фото игрока.

   Содержит:
   - drawRadar / drawRadarCompare
   - uploadPhoto
   ============================================================ */

/* ============================================================
   РАДАРЫ
   ============================================================ */

function drawRadar(p) {
  const ctx = document.getElementById('radar-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Техника','Физика','Тактика','Психология'],
      datasets: [{
        label: p.fio,
        data: [s.tehn, s.fiz, s.takt, s.psih],
        backgroundColor: 'rgba(21,71,52,.2)',
        borderColor: '#154734',
        borderWidth: 3,
        pointBackgroundColor: '#C8102E',
        pointBorderColor: '#fff',
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true, max: 10,
          ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
          grid: { color: '#C1C6C8' },
          angleLines: { color: '#C1C6C8' },
          pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawRadarCompare(p) {
  const ctx = document.getElementById('radar2-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  const e = getEndScores(p);
  const hasEnd = [e.tehn, e.fiz, e.takt, e.psih].some(v => v != null);

  const datasets = [{
    label: 'Начало сезона',
    data: [s.tehn, s.fiz, s.takt, s.psih],
    backgroundColor: 'rgba(21,71,52,.15)',
    borderColor: '#154734',
    borderWidth: 3,
    pointBackgroundColor: '#154734',
    pointRadius: 5
  }];
  if (hasEnd) {
    datasets.push({
      label: 'Конец сезона',
      data: [e.tehn, e.fiz, e.takt, e.psih],
      backgroundColor: 'rgba(200,16,46,.15)',
      borderColor: '#C8102E',
      borderWidth: 3,
      pointBackgroundColor: '#C8102E',
      pointRadius: 5
    });
  }

  new Chart(ctx, {
    type: 'radar',
    data: { labels: ['Техника','Физика','Тактика','Психология'], datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true, max: 10,
          ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
          grid: { color: '#C1C6C8' },
          angleLines: { color: '#C1C6C8' },
          pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' }
        }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

/* ============================================================
   ФОТО
   ============================================================ */

function uploadPhoto(pid) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } }
        else       { if (h > max) { w = w * max / h; h = max; } }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const p = DB.players.find(x => x.id === pid);
        if (!p) return;
        p.photo = c.toDataURL('image/jpeg', 0.8);
        saveDB();
        refreshProfile(pid);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}