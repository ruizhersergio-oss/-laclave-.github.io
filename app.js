// ============================================
// RESTAURANTE LA CLAVE - APP.JS
// Calendario MENSUAL con navegación
// ============================================

// Variables globales
let reservas = [];
let adminLogueado = false;
let diasBloqueados = [];
let mesActual = new Date(); // Para navegación del calendario

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    cargarReservas();
    cargarDiasBloqueados();
    inicializarFormularioReserva();
    cargarMenuDelDia();

    setInterval(() => {
        if (adminLogueado && document.getElementById('adminModal').classList.contains('show')) {
            actualizarEstadisticas();
        }
    }, 30000);
});
// Resetear botón de subida al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    const uploadLabel = document.querySelector('.upload-label');
    if (uploadLabel && uploadLabel.classList.contains('uploading')) {
        uploadLabel.classList.remove('uploading');
        uploadLabel.textContent = '📤 Subir nueva foto del menú';
    }
});

// ============================================
// GESTIÓN DE DÍAS BLOQUEADOS
// ============================================

function cargarDiasBloqueados() {
    try {
        const data = localStorage.getItem('dias_bloqueados_laclave');
        diasBloqueados = data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error cargando días bloqueados:', error);
        diasBloqueados = [];
    }
}

function guardarDiasBloqueados() {
    try {
        localStorage.setItem('dias_bloqueados_laclave', JSON.stringify(diasBloqueados));
    } catch (error) {
        console.error('Error guardando días bloqueados:', error);
    }
}

function toggleDiaBloqueado(fecha) {
    if (!adminLogueado) {
        alert('⚠️ Debes estar logueado como admin');
        return;
    }

    const index = diasBloqueados.indexOf(fecha);

    if (index > -1) {
        if (confirm(`¿Desbloquear el día ${formatearFecha(fecha)}?`)) {
            diasBloqueados.splice(index, 1);
            guardarDiasBloqueados();
            renderizarCalendario();
            alert('✅ Día desbloqueado');
        }
    } else {
        if (confirm(`¿Bloquear el día ${formatearFecha(fecha)}?\n\nNo se podrán hacer reservas para este día.`)) {
            diasBloqueados.push(fecha);
            guardarDiasBloqueados();
            renderizarCalendario();
            alert('✅ Día bloqueado. No se aceptarán reservas.');
        }
    }
}

function esDiaBloqueado(fecha) {
    return diasBloqueados.includes(fecha);
}

// ============================================
// GESTIÓN DE RESERVAS
// ============================================

async function cargarReservas() {
    try {
        // Cargar desde Firebase
        if (typeof firebase !== 'undefined' && firebase.database) {
            const snapshot = await firebase.database().ref('reservas').once('value');
            if (snapshot.exists()) {
                reservas = snapshot.val();
                localStorage.setItem('reservas_laclave', JSON.stringify(reservas));
            }
        } else {
            // Si no hay nube, usar local
            const data = localStorage.getItem('reservas_laclave');
            reservas = data ? JSON.parse(data) : [];
        }
        limpiarReservasAntiguas();
    } catch (error) {
        console.error('Error cargando reservas:', error);
    }
}


async function guardarReservas() {
    try {
        // Guardar en local
        localStorage.setItem('reservas_laclave', JSON.stringify(reservas));
        
        // ✅ Sincronizar con Firebase
        if (typeof firebase !== 'undefined' && firebase.database) {
            await firebase.database().ref('reservas').set(reservas);
            console.log("Reservas sincronizadas en la nube");
        }
    } catch (error) {
        console.error('Error guardando reservas:', error);
    }
}


function limpiarReservasAntiguas() {
    const hoy = new Date().setHours(0, 0, 0, 0);
    const hace30dias = hoy - (30 * 24 * 60 * 60 * 1000);

    reservas = reservas.filter(r => {
        const fechaReserva = new Date(r.fecha + 'T12:00:00').getTime();
        return fechaReserva >= hace30dias;
    });

    guardarReservas();
}

// ============================================
// FORMULARIO DE RESERVA
// ============================================

function inicializarFormularioReserva() {
    const fechaInput = document.getElementById('fecha');
    if (fechaInput) {
        const hoy = new Date();
        const manana = new Date(hoy);
        manana.setDate(hoy.getDate() + 1);

        const minFecha = formatearFechaInput(manana);
        fechaInput.setAttribute('min', minFecha);

        const maxFecha = new Date(hoy);
        maxFecha.setDate(hoy.getDate() + 90);
        fechaInput.setAttribute('max', formatearFechaInput(maxFecha));

        fechaInput.addEventListener('change', validarFechaBloqueada);
    }
}

function validarFechaBloqueada() {
    const fechaInput = document.getElementById('fecha');
    const horaSelect = document.getElementById('hora');

    if (!fechaInput || !fechaInput.value) return;

    if (esDiaBloqueado(fechaInput.value)) {
        alert('❌ Este día no está disponible para reservas.\nPor favor selecciona otra fecha.');
        fechaInput.value = '';
        horaSelect.innerHTML = '<option value="">Selecciona fecha primero</option>';
        return;
    }

    actualizarHorasDisponibles();
}

function formatearFechaInput(fecha) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function actualizarHorasDisponibles() {
    const fechaInput = document.getElementById('fecha');
    const horaSelect = document.getElementById('hora');

    if (!fechaInput || !horaSelect || !fechaInput.value) return;

    if (esDiaBloqueado(fechaInput.value)) {
        horaSelect.innerHTML = '<option value="">Día no disponible</option>';
        return;
    }

    const partes = fechaInput.value.split('-');
    const fechaSeleccionada = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const diaSemana = fechaSeleccionada.getDay();

    if (diaSemana === 1) {
        horaSelect.innerHTML = '<option value="">Cerrado los lunes</option>';
        return;
    }

    // Calcular personas por horario
    const reservasDelDia = reservas.filter(r => r.fecha === fechaInput.value && r.estado !== 'cancelada');
    
    const personasComida = reservasDelDia
        .filter(r => parseInt(r.hora.split(':')[0]) < 17)
        .reduce((sum, r) => sum + (r.personas === 'mas8' ? 10 : parseInt(r.personas)), 0);

    const personasCena = reservasDelDia
        .filter(r => parseInt(r.hora.split(':')[0]) >= 17)
        .reduce((sum, r) => sum + (r.personas === 'mas8' ? 10 : parseInt(r.personas)), 0);

    const horasComida = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
    const horasCena = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];

    let html = '<option value="">Selecciona hora</option>';

    // Comidas (solo si no está lleno)
    if (personasComida < 15) {
        html += '<optgroup label="🍽️ Mediodía">';
        horasComida.forEach(hora => {
            html += `<option value="${hora}">${hora}</option>`;
        });
        html += '</optgroup>';
    } else {
        html += '<optgroup label="🍽️ Mediodía - COMPLETO"></optgroup>';
    }

    // Cenas (solo si no está lleno)
    if (personasCena < 15) {
        html += '<optgroup label="🌙 Cena">';
        horasCena.forEach(hora => {
            html += `<option value="${hora}">${hora}</option>`;
        });
        html += '</optgroup>';
    } else {
        html += '<optgroup label="🌙 Cena - COMPLETO"></optgroup>';
    }

    horaSelect.innerHTML = html;
}


function mostrarDisponibilidad() {
    const fecha = document.getElementById('fecha')?.value;
    const hora = document.getElementById('hora')?.value;
    const personas = document.getElementById('personas')?.value;
    const infoDiv = document.getElementById('availabilityInfo');

    if (!fecha || !hora || !personas || !infoDiv) return;

    if (esDiaBloqueado(fecha)) {
        infoDiv.innerHTML = `<div class="availability-info full">✗ Día no disponible</div>`;
        return;
    }

    const reservasEnHorario = reservas.filter(r => 
        r.fecha === fecha && r.hora === hora && r.estado !== 'cancelada'
    );

    const totalPersonas = reservasEnHorario.reduce((sum, r) => {
        return sum + (r.personas === 'mas8' ? 10 : parseInt(r.personas));
    }, 0);

    const capacidadTotal = CONFIG.capacidades[hora.includes('20:') || hora.includes('21:') || hora.includes('22:') ? 'cena' : 'comida'];
    const disponible = capacidadTotal - totalPersonas;

    if (disponible >= parseInt(personas)) {
        infoDiv.innerHTML = `<div class="availability-info">✓ Disponible (${disponible} plazas libres)</div>`;
    } else if (disponible > 0) {
        infoDiv.innerHTML = `<div class="availability-info warning">⚠️ Quedan ${disponible} plazas</div>`;
    } else {
        infoDiv.innerHTML = `<div class="availability-info full">✗ Completo para esta hora</div>`;
    }
}

function enviarReserva(event) {
    event.preventDefault();

    const ultimoEnvio = parseInt(localStorage.getItem('ultimo_envio_reserva') || '0');
    const ahora = Date.now();
    if (ahora - ultimoEnvio < 60000) {
        alert('⏳ Por favor espera 1 minuto entre reservas.');
        return;
    }

    const nombre = sanitizarTexto(document.getElementById('nombre').value);
    const prefijo = document.getElementById('prefijo').value;
    const telefono = document.getElementById('telefono').value;
    const fecha = document.getElementById('fecha').value;
    const hora = document.getElementById('hora').value;
    const personas = document.getElementById('personas').value;
    const comentarios = sanitizarTexto(document.getElementById('comentarios')?.value || '');

    if (esDiaBloqueado(fecha)) {
        alert('❌ Este día no está disponible para reservas.');
        return;
    }

    if (nombre.length < 3) {
        alert('❌ El nombre debe tener al menos 3 caracteres');
        return;
    }

    if (!/^[0-9]{9}$/.test(telefono)) {
        alert('❌ El teléfono debe tener 9 dígitos');
        return;
    }

    const partes = fecha.split('-');
    const fechaReserva = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaReserva <= hoy) {
        alert('❌ Debes reservar con al menos 24h de antelación');
        return;
    }

    const reserva = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        nombre,
        telefono: prefijo + telefono,
        fecha,
        hora,
        personas,
        comentarios,
        estado: 'pendiente',
        fechaCreacion: new Date().toISOString()
    };

    reservas.push(reserva);
    guardarReservas();
    localStorage.setItem('ultimo_envio_reserva', ahora.toString());

    const mensaje = `🍽️ *NUEVA RESERVA - La Clave*

👤 *Nombre:* ${nombre}
📞 *Teléfono:* ${reserva.telefono}
📅 *Fecha:* ${formatearFecha(fecha)}
🕐 *Hora:* ${hora}
👥 *Personas:* ${personas === 'mas8' ? 'Más de 8' : personas}
${comentarios ? `💬 *Comentarios:* ${comentarios}` : ''}

_Reserva realizada desde la web_`;

    const urlWhatsApp = `https://wa.me/34669670985?text=${encodeURIComponent(mensaje)}`;

    window.open(urlWhatsApp, '_blank');

    document.getElementById('reservaForm').reset();
    document.getElementById('availabilityInfo').innerHTML = '';

    alert('✅ Reserva enviada. Te redirigimos a WhatsApp para confirmar.');
}

function sanitizarTexto(texto) {
    return texto
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim()
        .substring(0, 500);
}

// ============================================
// PANEL ADMIN
// ============================================

function abrirModalAdmin() {
    document.getElementById('adminModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function cerrarModalAdmin() {
    document.getElementById('adminModal').classList.remove('show');
    document.body.style.overflow = '';
    adminLogueado = false;
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminContent').classList.remove('active');
    document.getElementById('pinInput').value = '';
}

function verificarPIN() {
    const pin = document.getElementById('pinInput').value;

    if (pin === CONFIG.pinAdmin) {
        adminLogueado = true;
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminContent').classList.add('active');

        // Resetear al mes actual al entrar
        mesActual = new Date();
        cargarPanelAdmin();
    } else {
        alert('❌ PIN incorrecto');
        document.getElementById('pinInput').value = '';
    }
}

function cargarPanelAdmin() {
    actualizarEstadisticas();
    renderizarCalendario();
    renderizarTodasLasReservas();
    cargarGaleriaMenus();
}


function actualizarEstadisticas() {
    const hoy = new Date();
    const hoyStr = formatearFechaInput(hoy);

    const pendientes = reservas.filter(r => r.estado === 'pendiente').length;
    const confirmadas = reservas.filter(r => r.estado === 'confirmada').length;
    const reservasHoy = reservas.filter(r => r.fecha === hoyStr && r.estado !== 'cancelada').length;
    const ingresos = confirmadas * 25;

    document.getElementById('pendientesCount').textContent = pendientes;
    document.getElementById('confirmadasCount').textContent = confirmadas;
    document.getElementById('reservasHoyCount').textContent = reservasHoy;
    document.getElementById('ingresosEstimados').textContent = ingresos + '€';
}

// ============================================
// CALENDARIO MENSUAL CON NAVEGACIÓN
// ============================================

function cambiarMes(direccion) {
    mesActual.setMonth(mesActual.getMonth() + direccion);
    renderizarCalendario();
}

function irMesActual() {
    mesActual = new Date();
    renderizarCalendario();
}

function renderizarCalendario() {
    const calendarGrid = document.getElementById('calendarGrid');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const year = mesActual.getFullYear();
    const month = mesActual.getMonth();

    const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Primer día del mes
    const primerDia = new Date(year, month, 1);
    const diaSemanaInicio = primerDia.getDay();
    const diasDesdeInicio = diaSemanaInicio === 0 ? 6 : diaSemanaInicio - 1;

    // Último día del mes
    const ultimoDia = new Date(year, month + 1, 0);
    const diasEnMes = ultimoDia.getDate();

    // Calcular fecha de inicio (lunes anterior al 1 del mes)
    const fechaInicio = new Date(year, month, 1 - diasDesdeInicio);

    // Calcular total de semanas necesarias
    const totalDias = diasDesdeInicio + diasEnMes;
    const semanas = Math.ceil(totalDias / 7);

    // Header con navegación
    // Header con navegación
let html = `
<div style="width: 100%; display: block; margin-bottom: 2rem;">
    <div class="calendar-month-header">
        <button class="nav-month-btn" onclick="cambiarMes(-1)" title="Mes anterior">◀</button>
        <h3 class="calendar-month-title">${nombresMeses[month]} ${year}</h3>
        <button class="nav-month-btn" onclick="cambiarMes(1)" title="Mes siguiente">▶</button>
        <button class="today-btn" onclick="irMesActual()" title="Ir a hoy">Hoy</button>
    </div>
</div>

<div class="calendar-weeks-container" style="width: 100%; clear: both;">`;

    for (let semana = 0; semana < semanas; semana++) {
        html += '<div class="calendar-week-row">';

        for (let dia = 0; dia < 7; dia++) {
            const fecha = new Date(fechaInicio);
            fecha.setDate(fechaInicio.getDate() + (semana * 7) + dia);
            const fechaStr = formatearFechaInput(fecha);
            const diaSemana = fecha.getDay();

            const esDelMes = fecha.getMonth() === month;
            const esHoy = fecha.toDateString() === hoy.toDateString();
            const esPasado = fecha < hoy;
            const esCerrado = diaSemana === 1;
            const estaBloqueado = esDiaBloqueado(fechaStr);

            const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const reservasDelDia = reservas.filter(r => r.fecha === fechaStr && r.estado !== 'cancelada');
            const comida = reservasDelDia.filter(r => parseInt(r.hora.split(':')[0]) < 17).length;
            const cena = reservasDelDia.filter(r => parseInt(r.hora.split(':')[0]) >= 17).length;

            // Calcular personas totales para comida y cena
            const personasComida = reservasDelDia
                .filter(r => parseInt(r.hora.split(':')[0]) < 17)
                .reduce((sum, r) => sum + (r.personas === 'mas8' ? 10 : parseInt(r.personas)), 0);

            const personasCena = reservasDelDia
                .filter(r => parseInt(r.hora.split(':')[0]) >= 17)
                .reduce((sum, r) => sum + (r.personas === 'mas8' ? 10 : parseInt(r.personas)), 0);

            // Determinar clases de color según disponibilidad
            const claseComida = personasComida >= 15 ? 'lleno' : personasComida >= 8 ? 'medio-lleno' : 'disponible';
            const claseCena = personasCena >= 15 ? 'lleno' : personasCena >= 8 ? 'medio-lleno' : 'disponible';

            html += `
            <div class="calendar-day-box ${!esDelMes ? 'otro-mes' : ''} ${esHoy ? 'today' : ''} ${esPasado ? 'past' : ''} ${esCerrado ? 'closed' : ''} ${estaBloqueado ? 'blocked' : ''}" 
                 data-fecha="${fechaStr}"
                 onclick="mostrarReservasDelDia('${fechaStr}')">
                <div class="day-date">
                    <span class="day-number">${fecha.getDate()}</span>
                    <span class="day-name">${nombresDias[diaSemana]}</span>
                </div>
                <div class="day-stats">
                    ${estaBloqueado ? '<div class="blocked-label">✗ BLOQUEADO</div>' : 
                      esCerrado ? '<span class="closed-label">CERRADO</span>' : `
                        <div class="stat-row ${claseComida}">
                            <span class="icon">🍽️</span>
                            <span class="count">${personasComida}</span>
                        </div>
                        <div class="stat-row ${claseCena}">
                            <span class="icon">🌙</span>
                            <span class="count">${personasCena}</span>
                        </div>
                    `}
                </div>
                ${adminLogueado && !esPasado && !esCerrado && esDelMes ? `
                    <button class="toggle-block-btn" onclick="event.stopPropagation(); toggleDiaBloqueado('${fechaStr}')" title="${estaBloqueado ? 'Desbloquear día' : 'Bloquear día'}">
                        ${estaBloqueado ? '🔓' : '🔒'}
                    </button>
                ` : ''}
            </div>`;
        }

        html += '</div>';
    }

    html += '</div>';

    calendarGrid.innerHTML = html;
}

function mostrarReservasDelDia(fecha) {
    document.querySelectorAll('.calendar-day-box').forEach(c => c.classList.remove('selected'));
    const diaElement = document.querySelector(`.calendar-day-box[data-fecha="${fecha}"]`);
    if (diaElement) diaElement.classList.add('selected');

    const container = document.getElementById('dayReservationsContent');
    const selectedDate = document.getElementById('selectedDate');
    const dayReservationsSection = document.getElementById('dayReservations');

    if (!container || !selectedDate || !dayReservationsSection) return;

    selectedDate.textContent = formatearFecha(fecha);

    const reservasDelDia = reservas.filter(r => r.fecha === fecha && r.estado !== 'cancelada')
        .sort((a, b) => a.hora.localeCompare(b.hora));

    if (reservasDelDia.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:2rem;">No hay reservas para este día</p>';
    } else {
        let html = '';
        reservasDelDia.forEach(r => {
            html += `
            <div class="reservation-item ${r.estado}" data-id="${r.id}">
                <div class="reservation-info">
                    <strong>${r.nombre}</strong>
                    <small>🕐 ${r.hora} | 👥 ${r.personas === 'mas8' ? 'Más de 8' : r.personas} personas | 📞 ${r.telefono}</small>
                    ${r.comentarios ? `<small>💬 ${r.comentarios}</small>` : ''}
                </div>
                <div class="reservation-actions">
                    <span class="estado-badge ${r.estado}">${r.estado === 'pendiente' ? '⏳ Pendiente' : '✓ Confirmada'}</span>
                    ${r.estado === 'pendiente' ? `<button class="confirm-btn" onclick="confirmarReserva('${r.id}')">✓ Confirmar</button>` : ''}
                    <button class="delete-btn" onclick="eliminarReserva('${r.id}')">🗑️ Eliminar</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    dayReservationsSection.style.display = 'block';
    dayReservationsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderizarTodasLasReservas() {
    const container = document.getElementById('reservationsList');
    const hoy = new Date();
    const hoyStr = formatearFechaInput(hoy);

    const reservasFuturas = reservas
        .filter(r => r.fecha >= hoyStr && r.estado !== 'cancelada')
        .sort((a, b) => {
            const diff = a.fecha.localeCompare(b.fecha);
            return diff !== 0 ? diff : a.hora.localeCompare(b.hora);
        });

    if (reservasFuturas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:2rem;">No hay reservas futuras</p>';
        return;
    }

    let html = '';
    reservasFuturas.forEach(r => {
        html += `
        <div class="reservation-item ${r.estado}" data-id="${r.id}">
            <div class="reservation-info">
                <strong>${r.nombre}</strong>
                <small>📅 ${formatearFecha(r.fecha)} | 🕐 ${r.hora} | 👥 ${r.personas === 'mas8' ? 'Más de 8' : r.personas} personas | 📞 ${r.telefono}</small>
                ${r.comentarios ? `<small>💬 ${r.comentarios}</small>` : ''}
            </div>
            <div class="reservation-actions">
                <span class="estado-badge ${r.estado}">${r.estado === 'pendiente' ? '⏳ Pendiente' : '✓ Confirmada'}</span>
                ${r.estado === 'pendiente' ? `<button class="confirm-btn" onclick="confirmarReserva('${r.id}')">✓ Confirmar</button>` : ''}
                <button class="delete-btn" onclick="eliminarReserva('${r.id}')">🗑️ Eliminar</button>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function confirmarReserva(id) {
    const reserva = reservas.find(r => r.id === id);
    if (reserva) {
        reserva.estado = 'confirmada';
        guardarReservas();
        cargarPanelAdmin();
        alert('✅ Reserva confirmada');
    }
}

function eliminarReserva(id) {
    if (!confirm('¿Seguro que quieres eliminar esta reserva?')) return;

    reservas = reservas.filter(r => r.id !== id);
    guardarReservas();
    cargarPanelAdmin();
}

// ============================================
// RESERVA MANUAL
// ============================================

function mostrarModalReservaManual() {
    document.getElementById('manualReservationModal').classList.add('show');

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    document.getElementById('manualFecha').setAttribute('min', formatearFechaInput(manana));
}

function cerrarModalReservaManual() {
    document.getElementById('manualReservationModal').classList.remove('show');
    document.getElementById('manualReservationForm').reset();
}

function guardarReservaManual(event) {
    event.preventDefault();

    const nombre = sanitizarTexto(document.getElementById('manualNombre').value);
    const prefijo = document.getElementById('manualPrefijo').value;
    const telefono = document.getElementById('manualTelefono').value;
    const fecha = document.getElementById('manualFecha').value;
    const hora = document.getElementById('manualHora').value;
    const personas = document.getElementById('manualPersonas').value;
    const comentarios = sanitizarTexto(document.getElementById('manualComentarios')?.value || '');

    if (esDiaBloqueado(fecha)) {
        alert('❌ Este día está bloqueado. Desbloquéalo primero desde el calendario.');
        return;
    }

    const reserva = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        nombre,
        telefono: prefijo + telefono,
        fecha,
        hora,
        personas,
        comentarios,
        estado: 'confirmada',
        fechaCreacion: new Date().toISOString()
    };

    reservas.push(reserva);
    guardarReservas();

    cerrarModalReservaManual();
    cargarPanelAdmin();

    alert('✅ Reserva manual añadida correctamente');
}

// ============================================
// GESTIÓN DE MENÚ DEL DÍA
// ============================================

async function cargarMenuDelDia() {
    try {
        let menusActivos = [];

        // Intentar cargar desde Firebase primero
        if (typeof firebase !== 'undefined' && firebase.database) {
            const db = firebase.database();
            const snapshot = await db.ref('menus_activos').once('value');
            
            if (snapshot.exists()) {
                menusActivos = snapshot.val() || [];
                console.log('✅ Menús activos desde Firebase:', menusActivos.length);
            }
        }

        // Fallback a localStorage
        if (menusActivos.length === 0) {
            menusActivos = JSON.parse(localStorage.getItem('menus_activos') || '[]');
        }

        const container = document.querySelector('.menu-preview-container');
        const noMenuMsg = document.getElementById('noMenuMsg');

        if (!container) return;

        const existingContainer = container.querySelector('.menu-images-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        if (menusActivos.length === 0) {
            if (noMenuMsg) noMenuMsg.style.display = 'block';
            return;
        }

        if (noMenuMsg) noMenuMsg.style.display = 'none';

        const gridContainer = document.createElement('div');
        gridContainer.className = 'menu-images-container';

        menusActivos.forEach((menuUrl, index) => {
            const img = document.createElement('img');
            img.src = menuUrl;
            img.className = 'menu-img-display';
            img.alt = `Menú del día ${index + 1}`;
            img.onclick = () => verImagenCompleta(menuUrl);
            gridContainer.appendChild(img);
        });

        container.appendChild(gridContainer);

    } catch (error) {
        console.error('Error cargando menú:', error);
    }
}

async function subirFotoMenu(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('❌ Solo se permiten imágenes');
        input.value = '';
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('❌ La imagen no puede superar 5MB');
        input.value = '';
        return;
    }

    const uploadLabel = document.querySelector('.upload-label');
    uploadLabel.classList.add('uploading');
    uploadLabel.textContent = '⏳ Subiendo a la nube...';

    try {
        // ✅ Subir a ImgBB
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${CONFIG.imgbb.apiKey}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            const nuevoMenu = {
                id: Date.now().toString(),
                url: data.data.url,           // URL de ImgBB
                display_url: data.data.display_url,
                thumb_url: data.data.thumb.url,
                fecha: new Date().toISOString(),
                activo: false
            };

            // Guardar en Firebase
            if (typeof firebase !== 'undefined' && firebase.database) {
                await firebase.database().ref('menus_subidos/' + nuevoMenu.id).set(nuevoMenu);
                console.log('✅ Menú guardado en Firebase con URL de ImgBB');
            }

            // Backup local
            const menusLocal = JSON.parse(localStorage.getItem('menus_subidos') || '[]');
            menusLocal.push(nuevoMenu);
            if (menusLocal.length > 10) {
                menusLocal.shift();
            }
            localStorage.setItem('menus_subidos', JSON.stringify(menusLocal));

            uploadLabel.classList.remove('uploading');
            uploadLabel.textContent = '📤 Subir nueva foto del menú';
            input.value = '';

            cargarGaleriaMenus();
            alert('✅ Foto subida correctamente a la nube');

        } else {
            throw new Error('Error al subir imagen a ImgBB');
        }

    } catch (error) {
        console.error('Error:', error);
        uploadLabel.classList.remove('uploading');
        uploadLabel.textContent = '📤 Subir nueva foto del menú';
        alert('❌ Error al subir la imagen. Verifica tu conexión.');
        input.value = '';
    }
}



    const reader = new FileReader();
    const uploadLabel = document.querySelector('.upload-label');
    uploadLabel.classList.add('uploading');
    uploadLabel.textContent = '⏳ Subiendo...';

    reader.onload = async function(e) {
        const imgData = e.target.result;

        try {
            const nuevoMenu = {
                id: Date.now().toString(),
                url: imgData,
                fecha: new Date().toISOString(),
                activo: false
            };

            // Guardar en localStorage (backup local)
            const menusLocal = JSON.parse(localStorage.getItem('menus_subidos') || '[]');
            menusLocal.push(nuevoMenu);
            if (menusLocal.length > 10) {
                menusLocal.shift();
            }
            localStorage.setItem('menus_subidos', JSON.stringify(menusLocal));

            // ✅ NUEVO: Guardar en Firebase
            if (typeof firebase !== 'undefined' && firebase.database) {
                const db = firebase.database();
                await db.ref('menus_subidos/' + nuevoMenu.id).set(nuevoMenu);
                console.log('✅ Menú guardado en Firebase');
            }

            uploadLabel.classList.remove('uploading');
            uploadLabel.textContent = '📤 Subir nueva foto del menú';
            input.value = '';

            cargarGaleriaMenus();
            alert('✅ Foto subida correctamente');

        } catch (error) {
            console.error('Error:', error);
            uploadLabel.classList.remove('uploading');
            uploadLabel.textContent = '📤 Subir nueva foto del menú';
            alert('❌ Error al subir. La imagen puede ser muy grande.');
        }
    };

    reader.readAsDataURL(file);



async function cargarGaleriaMenus() {
    const gallery = document.getElementById('menuGallery');
    if (!gallery) return;

    try {
        let menus = [];
        let menusActivos = [];

        // ✅ SIEMPRE intentar cargar desde Firebase primero
        if (typeof firebase !== 'undefined' && firebase.database) {
            const db = firebase.database();
            
            // Cargar menús
            const snapshotMenus = await db.ref('menus_subidos').once('value');
            if (snapshotMenus.exists()) {
                const menusFirebase = snapshotMenus.val();
                menus = Object.values(menusFirebase);
                console.log('✅ Menús cargados desde Firebase:', menus.length);
            }

            // Cargar menús activos
            const snapshotActivos = await db.ref('menus_activos').once('value');
            if (snapshotActivos.exists()) {
                menusActivos = snapshotActivos.val() || [];
                console.log('✅ Menús activos desde Firebase:', menusActivos.length);
            }

            // Sincronizar con localStorage
            localStorage.setItem('menus_subidos', JSON.stringify(menus));
            localStorage.setItem('menus_activos', JSON.stringify(menusActivos));
        }

        // Si no hay en Firebase, usar localStorage como fallback
        if (menus.length === 0) {
            menus = JSON.parse(localStorage.getItem('menus_subidos') || '[]');
            menusActivos = JSON.parse(localStorage.getItem('menus_activos') || '[]');
            console.log('📦 Menús desde localStorage:', menus.length);
        }

        if (menus.length === 0) {
            gallery.innerHTML = '<p class="no-menus-msg">No hay fotos subidas aún</p>';
            return;
        }

        renderizarGaleriaMenus(menus, gallery);

    } catch (error) {
        console.error('Error cargando galería:', error);
        gallery.innerHTML = '<p class="no-menus-msg">Error al cargar menús</p>';
    }
}



function renderizarGaleriaMenus(menus, gallery) {
    const menusActivos = JSON.parse(localStorage.getItem('menus_activos') || '[]');

    let html = '';
    menus.reverse().forEach(menu => {
        const fecha = new Date(menu.fecha);
        const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const esActivo = menusActivos.includes(menu.url);

        html += `
    <div class="menu-gallery-item">
        ${esActivo ? '<span class="active-badge">✓ ACTIVO</span>' : ''}
        <img src="${menu.url}" alt="Menú ${fechaStr}" onclick="verImagenCompleta('${menu.url}')">
        <div class="menu-gallery-meta">
            <small>${fechaStr}</small>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            ${!esActivo ? 
                `<button class="activate-menu-btn" onclick="activarMenuEnHome('${menu.id}', '${menu.url}')" title="Activar">Activar</button>` 
                : 
                `<button class="deactivate-menu-btn" onclick="desactivarMenuEnHome('${menu.id}', '${menu.url}')" title="Desactivar">Desactivar</button>`
            }
            <button class="delete-img-btn" onclick="eliminarFotoMenu('${menu.id}')" title="Eliminar foto">❌</button>
        </div>
    </div>
`;

    });

    gallery.innerHTML = html;
}

async function activarMenuEnHome(menuId, imgUrl) {
    try {
        let menusActivos = JSON.parse(localStorage.getItem('menus_activos') || '[]');

        if (menusActivos.length >= 2 && !menusActivos.includes(imgUrl)) {
            alert('⚠️ Solo puedes tener 2 menús activos.\nDesactiva uno primero.');
            return;
        }

        if (!menusActivos.includes(imgUrl)) {
            menusActivos.push(imgUrl);
            localStorage.setItem('menus_activos', JSON.stringify(menusActivos));
            
            // ✅ Sincronizar con Firebase
            if (typeof firebase !== 'undefined' && firebase.database) {
                await firebase.database().ref('menus_activos').set(menusActivos);
                
                // ✅ NUEVO: Actualizar estado en menus_subidos
                await firebase.database().ref(`menus_subidos/${menuId}/activo`).set(true);
            }
            
            cargarMenuDelDia();
            cargarGaleriaMenus();
            alert('✅ Menú activado');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al activar');
    }
}


async function desactivarMenuEnHome(menuId, imgUrl) {
    try {
        let menusActivos = JSON.parse(localStorage.getItem('menus_activos') || '[]');
        menusActivos = menusActivos.filter(url => url !== imgUrl);
        localStorage.setItem('menus_activos', JSON.stringify(menusActivos));
        
        // ✅ Sincronizar con Firebase
        if (typeof firebase !== 'undefined' && firebase.database) {
            await firebase.database().ref('menus_activos').set(menusActivos);
            
            // ✅ Actualizar estado en menus_subidos
            if (menuId) {
                await firebase.database().ref(`menus_subidos/${menuId}/activo`).set(false);
            }
        }
        
        cargarMenuDelDia();
        cargarGaleriaMenus();
        alert('✅ Menú desactivado');
    } catch (error) {
        console.error('Error:', error);
    }
}



async function eliminarFotoMenu(menuId) {
    if (!confirm('¿Eliminar esta foto del menú?')) return;

    try {
        // Obtener menú local
        let menus = JSON.parse(localStorage.getItem('menus_subidos') || '[]');
        const menuAEliminar = menus.find(m => m.id === menuId);

        if (menuAEliminar) {
            await desactivarMenuEnHome(menuId, menuAEliminar.url);
        }

        // Eliminar de local
        menus = menus.filter(m => m.id !== menuId);
        localStorage.setItem('menus_subidos', JSON.stringify(menus));

        // ✅ Eliminar de Firebase
        if (typeof firebase !== 'undefined' && firebase.database) {
            await firebase.database().ref('menus_subidos/' + menuId).remove();
            console.log('✅ Menú eliminado de Firebase');
        }

        cargarGaleriaMenus();
        cargarMenuDelDia();
        alert('✅ Menú eliminado correctamente');

    } catch (error) {
        console.error('Error eliminando menú:', error);
        alert('❌ Error al eliminar');
    }
}



function verImagenCompleta(url) {
    window.open(url, '_blank');
}

// ============================================
// MODALES LEGALES
// ============================================

function abrirModalLegal() {
    document.getElementById('legalModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function cerrarModalLegal() {
    document.getElementById('legalModal').classList.remove('show');
    document.body.style.overflow = '';
}
// Migrar menús antiguos a Firebase (ejecutar una sola vez)
async function migrarMenusAFirebase() {
    try {
        // Obtener menús del localStorage
        const menusLocal = JSON.parse(localStorage.getItem('menus_subidos') || '[]');
        const menusActivosLocal = JSON.parse(localStorage.getItem('menus_activos') || '[]');

        if (menusLocal.length === 0) {
            console.log('No hay menús para migrar');
            return;
        }

        console.log('Migrando', menusLocal.length, 'menús a Firebase...');

        // Subir cada menú a Firebase
        for (const menu of menusLocal) {
            // Marcar si está activo
            menu.activo = menusActivosLocal.includes(menu.url);
            
            await firebase.database().ref('menus_subidos/' + menu.id).set(menu);
        }

        // Subir menús activos
        await firebase.database().ref('menus_activos').set(menusActivosLocal);

        console.log('✅ Migración completada');
        alert('✅ Migración completada. Recarga la página.');
        
    } catch (error) {
        console.error('Error en migración:', error);
        alert('❌ Error en la migración');
    }
}

// ============================================
// UTILIDADES
// ============================================

function formatearFecha(fechaStr) {
    const partes = fechaStr.split('-');
    const fecha = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return fecha.toLocaleDateString('es-ES', opciones);
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('legal-modal')) {
        event.target.classList.remove('show');
        document.body.style.overflow = '';
    }
};