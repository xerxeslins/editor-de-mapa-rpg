window.addEventListener('DOMContentLoaded', () => {
    
    const canvas = document.getElementById('mapCanvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 32;
    canvas.width = 1280;
    canvas.height = 720;

    // --- ESTADO DA FERRAMENTA ---
    let selectedColor = '#3a3a3a';
    let paintedCells = {};
    let penStrokes = [];
    let texts = [];
    let shapes = [];
    let editMode = 'paint';
    let backgroundColor = '#000000';
    let isDrawing = false;
    let isDragging = false;
    let eraserSize = 8;
    let mousePos = { x: 0, y: 0 };
    let selectedTextForAction = null; 
    let dragOffsetX, dragOffsetY;
    let startPos = null;

    // --- SISTEMA DE HISTÓRICO ---
    let historyStack = [];
    let redoStack = [];

    // --- CONTROLES DA UI ---
    const paletteColors = document.querySelectorAll('.palette-color');
    const modeSelector = document.getElementById('modeSelector');
    const eraserControls = document.getElementById('eraser-controls');
    const saveMapButton = document.getElementById('saveMapButton');
    const loadMapButton = document.getElementById('loadMapButton');
    const clearMapButton = document.getElementById('clearMapButton');
    const textContextMenu = document.getElementById('text-context-menu');

    // --- FUNÇÕES DE DESENHO ---
    function render() {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawPaintedCells();
        drawPenStrokes();
        drawShapes();
        drawGrid();
        drawTexts();
        if (isDrawing && startPos && ['line', 'rectangle', 'square', 'circle'].includes(editMode)) {
            drawShapePreview();
        }
        if (editMode === 'eraser') {
            drawEraserPreview();
        }
    }
    function drawGrid() {
        const gridColor = (backgroundColor === '#000000') ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)';
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
    }
    function drawPaintedCells() {
        for (const key in paintedCells) {
            const cell = paintedCells[key];
            if (!cell) continue;
            const [x, y] = key.split('-').map(Number);
            ctx.fillStyle = cell.color === 'transparent' ? backgroundColor : cell.color;
            ctx.fillRect(x, y, gridSize, gridSize);
            if (cell.shape) {
                ctx.fillStyle = cell.shapeColor;
                ctx.strokeStyle = cell.shapeColor;
                ctx.lineWidth = 3;
                ctx.beginPath();
                const centerX = x + gridSize / 2;
                const centerY = y + gridSize / 2;
                const padding = gridSize * 0.2;
                switch (cell.shape) {
                    case 'paint_triangle':
                        ctx.moveTo(centerX, y + padding);
                        ctx.lineTo(x + gridSize - padding, y + gridSize - padding);
                        ctx.lineTo(x + padding, y + gridSize - padding);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    case 'paint_circle':
                        ctx.arc(centerX, centerY, (gridSize / 2) - padding, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'paint_x':
                        ctx.moveTo(x + padding, y + padding);
                        ctx.lineTo(x + gridSize - padding, y + gridSize - padding);
                        ctx.moveTo(x + gridSize - padding, y + padding);
                        ctx.lineTo(x + padding, y + gridSize - padding);
                        ctx.stroke();
                        break;
                }
            }
        }
    }
    function drawPenStrokes() {
        penStrokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            ctx.strokeStyle = stroke.isEraser ? backgroundColor : stroke.color;
            ctx.lineWidth = stroke.size;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (const point of stroke.points) ctx.lineTo(point.x, point.y);
            ctx.stroke();
        });
    }
    function drawTexts() {
        texts.forEach(text => {
            ctx.font = '16px monospace';
            ctx.fillStyle = (text === selectedTextForAction && isDragging) ? '#00ffcc' : text.color;
            ctx.fillText(text.content, text.x, text.y);
        });
    }
    function drawShapes() {
        shapes.forEach(shape => {
            ctx.strokeStyle = shape.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            switch (shape.type) {
                case 'line':
                    ctx.moveTo(shape.startX, shape.startY);
                    ctx.lineTo(shape.endX, shape.endY);
                    break;
                case 'rectangle':
                case 'square':
                    ctx.rect(shape.startX, shape.startY, shape.width, shape.height);
                    break;
                case 'circle':
                    ctx.arc(shape.startX, shape.startY, shape.radius, 0, Math.PI * 2);
                    break;
            }
            ctx.stroke();
        });
    }
    function drawShapePreview() {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        let width = mousePos.x - startPos.x;
        let height = mousePos.y - startPos.y;
        switch (editMode) {
            case 'line':
                ctx.moveTo(startPos.x, startPos.y);
                ctx.lineTo(mousePos.x, mousePos.y);
                break;
            case 'rectangle':
                ctx.rect(startPos.x, startPos.y, width, height);
                break;
            case 'square':
                let side = Math.max(Math.abs(width), Math.abs(height));
                ctx.rect(startPos.x, startPos.y, side * Math.sign(width), side * Math.sign(height));
                break;
            case 'circle':
                let radius = Math.hypot(width, height);
                ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
                break;
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function drawEraserPreview() {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.arc(mousePos.x, mousePos.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // --- LÓGICA DE CONTROLES ---
    function setEditMode(newMode) {
        editMode = newMode;
        hideTextContextMenu();
        if (newMode === 'eraser') canvas.style.cursor = 'none';
        else if (newMode === 'text') canvas.style.cursor = 'text';
        else canvas.style.cursor = 'crosshair';
    }
    paletteColors.forEach(colorDiv => {
        colorDiv.addEventListener('click', () => {
            const color = colorDiv.dataset.color;
            if (editMode === 'background') {
                addHistory({ type: 'background_change', oldColor: backgroundColor, newColor: color });
                backgroundColor = color;
                render();
                return;
            }
            paletteColors.forEach(div => div.classList.remove('selected'));
            colorDiv.classList.add('selected');
            selectedColor = color;
            if (editMode === 'eraser') {
                modeSelector.value = 'pen';
                setEditMode('pen');
            }
        });
    });
    modeSelector.addEventListener('change', (e) => setEditMode(e.target.value));
    eraserControls.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            eraserSize = parseInt(e.target.dataset.size, 10);
            setEditMode('eraser');
            paletteColors.forEach(div => div.classList.remove('selected'));
        }
    });
    clearMapButton.addEventListener('click', () => {
        if (confirm("Você tem certeza que deseja limpar todo o mapa? Esta ação não pode ser desfeita.")) {
            paintedCells = {}; penStrokes = []; texts = []; shapes = [];
            backgroundColor = '#000000'; historyStack = []; redoStack = [];
            render();
        }
    });

    // --- LÓGICA DO MENU DE CONTEXTO DE TEXTO ---
    function showTextContextMenu(text, event) {
        selectedTextForAction = text;
        textContextMenu.style.display = 'flex';
        const rect = canvas.getBoundingClientRect();
        textContextMenu.style.left = `${event.clientX - rect.left}px`;
        textContextMenu.style.top = `${event.clientY - rect.top}px`;
    }
    function hideTextContextMenu() {
        textContextMenu.style.display = 'none';
        if (!isDragging) {
            selectedTextForAction = null;
        }
    }
    document.getElementById('edit-text-btn').addEventListener('click', () => {
        if (!selectedTextForAction) return;
        const oldText = selectedTextForAction.content;
        const oldColor = selectedTextForAction.color;
        const newTextContent = prompt("Edite o texto:", oldText);
        if (newTextContent) {
            selectedTextForAction.content = newTextContent;
            selectedTextForAction.color = selectedColor;
            addHistory({ type: 'edit_text', text: selectedTextForAction, oldText, oldColor, newText: newTextContent, newColor: selectedColor });
            hideTextContextMenu();
            render();
        }
    });
    document.getElementById('copy-text-btn').addEventListener('click', () => {
        if (!selectedTextForAction) return;
        const newText = { ...selectedTextForAction, id: Date.now(), y: selectedTextForAction.y + 20 };
        texts.push(newText);
        addHistory({ type: 'add_text', text: newText });
        hideTextContextMenu();
        render();
    });
    document.getElementById('move-text-btn').addEventListener('click', () => {
        if (!selectedTextForAction) return;
        isDragging = true;
        addHistory({ type: 'move_text', text: selectedTextForAction, oldX: selectedTextForAction.x, oldY: selectedTextForAction.y });
        hideTextContextMenu();
    });
    document.getElementById('delete-text-btn').addEventListener('click', () => {
        if (!selectedTextForAction) return;
        const index = texts.findIndex(t => t.id === selectedTextForAction.id);
        if (index > -1) {
            addHistory({ type: 'remove_text', text: selectedTextForAction, index: index });
            texts.splice(index, 1);
            hideTextContextMenu();
            render();
        }
    });

    // --- LÓGICA DE INTERAÇÃO DO MOUSE ---
    function getMousePos(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    canvas.addEventListener('mousedown', (e) => {
        if (isDragging) {
            return;
        }

        const currentMousePos = getMousePos(e);
        startPos = currentMousePos;
        isDrawing = true;
        hideTextContextMenu();

        if (editMode === 'text') {
            isDrawing = false;
            let clickedOnText = null;
            for (let i = texts.length - 1; i >= 0; i--) {
                const text = texts[i];
                const textWidth = ctx.measureText(text.content).width;
                if (currentMousePos.x >= text.x && currentMousePos.x <= text.x + textWidth &&
                    currentMousePos.y <= text.y && currentMousePos.y >= text.y - 16) {
                    clickedOnText = text;
                    break;
                }
            }
            if (clickedOnText) {
                showTextContextMenu(clickedOnText, e);
            } else {
                const textContent = prompt("Digite o texto:");
                if (textContent) {
                    const textObj = { content: textContent, x: currentMousePos.x, y: currentMousePos.y, color: selectedColor, id: Date.now() };
                    texts.push(textObj);
                    addHistory({ type: 'add_text', text: textObj });
                    render();
                }
            }
        } else {
            handlePaint(e);
        }
    });
    canvas.addEventListener('mousemove', (e) => {
        mousePos = getMousePos(e);
        if (isDragging && selectedTextForAction) {
            if (dragOffsetX === undefined) {
                dragOffsetX = mousePos.x - selectedTextForAction.x;
                dragOffsetY = mousePos.y - selectedTextForAction.y;
            }
            selectedTextForAction.x = mousePos.x - dragOffsetX;
            selectedTextForAction.y = mousePos.y - dragOffsetY;
        } else if (isDrawing) {
            handlePaint(e);
        }
        render();
    });
    canvas.addEventListener('mouseup', (e) => {
        if (isDrawing && startPos && ['line', 'rectangle', 'square', 'circle'].includes(editMode)) {
            const shape = createShapeObject(startPos, getMousePos(e));
            if (shape) { shapes.push(shape); addHistory({ type: 'add_shape', shape: shape }); }
        }
        if (isDragging) {
            const lastAction = historyStack[historyStack.length - 1];
            if (lastAction && lastAction.type === 'move_text' && lastAction.text === selectedTextForAction) {
                lastAction.newX = selectedTextForAction.x;
                lastAction.newY = selectedTextForAction.y;
            }
            isDragging = false;
            selectedTextForAction = null;
            dragOffsetX = undefined;
            dragOffsetY = undefined;
        }
        isDrawing = false;
        startPos = null;
        if (penStrokes.length > 0) {
            const lastStroke = penStrokes[penStrokes.length - 1];
            if(lastStroke) lastStroke.isFinished = true;
        }
        render();
    });
    canvas.addEventListener('mouseleave', () => { isDrawing = false; isDragging = false; startPos = null; render(); });
    canvas.addEventListener('mouseenter', () => setEditMode(editMode));
    function handlePaint(e) {
        const currentMousePos = getMousePos(e);
        if (!isDrawing) return;
        const isFreehandShapeMode = ['line', 'rectangle', 'square', 'circle'].includes(editMode);
        if (isFreehandShapeMode) return;
        const isPaintShapeMode = ['paint', 'paint_triangle', 'paint_circle', 'paint_x'].includes(editMode);
        if (isPaintShapeMode) {
            const gridX = Math.floor(currentMousePos.x / gridSize) * gridSize;
            const gridY = Math.floor(currentMousePos.y / gridSize) * gridSize;
            const cellKey = `${gridX}-${gridY}`;
            if (e.buttons === 1) {
                const oldCell = paintedCells[cellKey] ? { ...paintedCells[cellKey] } : null;
                let newCell;
                if (editMode === 'paint') {
                    newCell = { color: selectedColor, shape: null, shapeColor: null };
                } else {
                    newCell = { color: oldCell?.color || 'transparent', shape: editMode, shapeColor: selectedColor };
                }
                addHistory({ type: 'paint_cell', key: cellKey, oldCell: oldCell, newCell: newCell });
                paintedCells[cellKey] = newCell;
            } else if (e.buttons === 2) {
                if (cellKey in paintedCells) {
                    addHistory({ type: 'paint_cell', key: cellKey, oldCell: paintedCells[cellKey], newCell: null });
                    delete paintedCells[cellKey];
                }
            }
        } else if (editMode === 'pen') {
            let lastStroke = penStrokes[penStrokes.length - 1];
            if (!lastStroke || lastStroke.isFinished) {
                const stroke = { type: 'pen', color: selectedColor, size: 4, points: [currentMousePos], isFinished: false };
                penStrokes.push(stroke);
                addHistory({ type: 'add_stroke', stroke: stroke });
            } else {
                lastStroke.points.push(currentMousePos);
            }
        } else if (editMode === 'eraser') {
            let somethingWasErased = false;
            for (let i = texts.length - 1; i >= 0; i--) {
                const text = texts[i];
                const textWidth = ctx.measureText(text.content).width;
                if (currentMousePos.x > text.x && currentMousePos.x < text.x + textWidth &&
                    currentMousePos.y > text.y - 16 && currentMousePos.y < text.y) {
                    addHistory({ type: 'remove_text', text: text, index: i });
                    texts.splice(i, 1);
                    somethingWasErased = true;
                    break;
                }
            }
            if (somethingWasErased) return;
            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                const margin = 5;
                let isOver = false;
                if (shape.type === 'line') {
                    const dist = Math.abs((shape.endY - shape.startY) * currentMousePos.x - (shape.endX - shape.startX) * currentMousePos.y + shape.endX * shape.startY - shape.endY * shape.startX) / Math.hypot(shape.endY - shape.startY, shape.endX - shape.startX);
                    isOver = dist < margin;
                } else if (shape.type === 'rectangle' || shape.type === 'square') {
                    isOver = currentMousePos.x > shape.startX - margin && currentMousePos.x < shape.startX + shape.width + margin &&
                             currentMousePos.y > shape.startY - margin && currentMousePos.y < shape.startY + shape.height + margin;
                } else if (shape.type === 'circle') {
                    isOver = Math.hypot(currentMousePos.x - shape.startX, currentMousePos.y - shape.startY) < shape.radius + margin;
                }
                if (isOver) {
                    addHistory({ type: 'remove_shape', shape: shape, index: i });
                    shapes.splice(i, 1);
                    somethingWasErased = true;
                    break;
                }
            }
            if (somethingWasErased) return;
            let lastStroke = penStrokes[penStrokes.length - 1];
            if (!lastStroke || lastStroke.isFinished || !lastStroke.isEraser) {
                const stroke = { type: 'pen', size: eraserSize, points: [currentMousePos], isFinished: false, isEraser: true };
                penStrokes.push(stroke);
                addHistory({ type: 'add_stroke', stroke: stroke });
            } else {
                lastStroke.points.push(currentMousePos);
            }
        }
    }
    function createShapeObject(start, end) {
        let width = end.x - start.x;
        let height = end.y - start.y;
        let shape = { type: editMode, color: selectedColor, startX: start.x, startY: start.y, id: Date.now() };
        switch (editMode) {
            case 'line': shape.endX = end.x; shape.endY = end.y; break;
            case 'rectangle': shape.width = width; shape.height = height; break;
            case 'square':
                let side = Math.max(Math.abs(width), Math.abs(height));
                shape.width = side * Math.sign(width);
                shape.height = side * Math.sign(height);
                break;
            case 'circle': shape.radius = Math.hypot(width, height); break;
            default: return null;
        }
        return shape;
    }
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- LÓGICA DO HISTÓRICO E SALVAR/CARREGAR ---
    function addHistory(action) {
        historyStack.push(action);
        redoStack = [];
    }
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            let action = historyStack.pop();
            if (!action) return;
            undoAction(action);
            redoStack.push(action);
            render();
        } else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            let action = redoStack.pop();
            if (!action) return;
            redoAction(action);
            historyStack.push(action);
            render();
        }
    });
    function undoAction(action) {
        switch (action.type) {
            case 'paint_cell':
                if (action.oldCell) paintedCells[action.key] = action.oldCell;
                else delete paintedCells[action.key];
                break;
            case 'add_stroke': penStrokes.pop(); break;
            case 'add_text': texts.pop(); break;
            case 'remove_text': texts.splice(action.index, 0, action.text); break;
            case 'edit_text':
                action.text.content = action.oldText;
                action.text.color = action.oldColor;
                break;
            case 'move_text':
                action.text.x = action.oldX;
                action.text.y = action.oldY;
                break;
            case 'add_shape': shapes.pop(); break;
            case 'remove_shape': shapes.splice(action.index, 0, action.shape); break;
            case 'background_change': backgroundColor = action.oldColor; break;
        }
    }
    function redoAction(action) {
        switch (action.type) {
            case 'paint_cell':
                if (action.newCell) paintedCells[action.key] = action.newCell;
                else delete paintedCells[action.key];
                break;
            case 'add_stroke': penStrokes.push(action.stroke); break;
            case 'add_text': texts.push(action.text); break;
            case 'remove_text': texts.splice(action.index, 1); break;
            case 'edit_text':
                action.text.content = action.newText;
                action.text.color = action.newColor;
                break;
            case 'move_text':
                action.text.x = action.newX;
                action.text.y = action.newY;
                break;
            case 'add_shape': shapes.push(action.shape); break;
            case 'remove_shape': shapes.splice(action.index, 1); break;
            case 'background_change': backgroundColor = action.newColor; break;
        }
    }

    function showModal(title, content, onConfirm) {
        const overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'modal-content';
        const h2 = document.createElement('h2');
        h2.textContent = title;
        const textarea = document.createElement('textarea');
        textarea.value = content;
        const buttonContainer = document.createElement('div');
        const confirmButton = document.createElement('button');
        confirmButton.textContent = onConfirm ? 'Carregar' : 'Copiar para Área de Transferência';
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Fechar';
        buttonContainer.append(confirmButton, cancelButton);
        modal.append(h2, textarea, buttonContainer);
        overlay.append(modal);
        document.body.append(overlay);
        textarea.select();
        confirmButton.onclick = () => {
            if (onConfirm) {
                onConfirm(textarea.value);
            } else {
                navigator.clipboard.writeText(textarea.value).then(() => {
                    confirmButton.textContent = 'Copiado!';
                }, () => {
                    alert('Falha ao copiar. Por favor, use Ctrl+C.');
                });
            }
        };
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
        };
    }

    saveMapButton.addEventListener('click', () => {
        const mapData = {
            cells: paintedCells,
            strokes: penStrokes,
            texts: texts,
            shapes: shapes,
            bgColor: backgroundColor
        };
        const mapJson = JSON.stringify(mapData, null, 2);
        showModal('Salvar Mapa', mapJson, null);
    });

    loadMapButton.addEventListener('click', () => {
        showModal('Carregar Mapa', '', (mapJson) => {
            if (!mapJson) return;
            try {
                const mapData = JSON.parse(mapJson);
                paintedCells = mapData.cells || {};
                penStrokes = mapData.strokes || [];
                texts = mapData.texts || [];
                shapes = mapData.shapes || [];
                backgroundColor = mapData.bgColor || '#000000';
                historyStack = [];
                redoStack = [];
                render();
                document.body.removeChild(document.getElementById('modal-overlay'));
            } catch (e) {
                alert("Erro ao carregar o mapa. Dados JSON inválidos.");
                console.error("Erro de parse JSON:", e);
            }
        });
    });

    // --- INICIA A FERRAMENTA ---
    setEditMode('paint');
    render();
});
