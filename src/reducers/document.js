"use strict";

import { vec3 } from 'gl-matrix';
import uuid from 'node-uuid';
import Snap from 'snapsvg-cjs';

import { forest, getSubtreeIds, object, reduceParents, reduceSubtree } from '../reducers/object'
import { addDocument, addDocumentChild } from '../actions/document'
import { elementToRawPaths, flipY } from '../lib/mesh'

const documentBase = object('document', {
    type: '?',
    name: '',
    isRoot: false,
    children: [],
    selected: false,
});

export function document(state, action) {
    switch (action.type) {
        case 'DOCUMENT_TRANSLATE_SELECTED':
            if (state.selected && state.translate) {
                return { ...state, translate: vec3.add([], state.translate, action.payload) };
            } else
                return state;
        case 'DOCUMENT_SCALE_TRANSLATE_SELECTED':
            if (state.selected && state.scale && state.translate) {
                return {
                    ...state,
                    scale: vec3.mul([], state.scale, action.payload.scale),
                    translate: vec3.add([], vec3.mul([], action.payload.scale, state.translate), action.payload.translate),
                };
            } else
                return state;
        default:
            return documentBase(state, action)
    }
}

const documentsForest = forest('document', document);

function loadSvg(state, settings, {file, content}) {
    state = state.slice();
    let pxPerInch = +settings.pxPerInch || 96; // TODO: dpiIllustrator, dpiInkscape?

    // TODO catch and report errors
    let svg = Snap.parse(content).node.children[0];
    let allPositions = [];

    function getColor(c) {
        let sc = Snap.color(c);
        if (sc.r === -1 || sc.g === -1 || sc.b === -1)
            return [0, 0, 0, 1];
        else
            return [sc.r / 255, sc.g / 255, sc.b / 255, 1];
    }

    function addChildren(parent, node) {
        for (let child of node.children) {
            let c = {
                id: uuid.v4(),
                type: child.nodeName,
                name: child.nodeName + ': ' + child.id,
                isRoot: false,
                children: [],
                selected: false,
            };
            if (child.nodeName === 'path') {
                // TODO: report errors
                // TODO: settings for minNumSegments, minSegmentLength
                c.rawPaths = elementToRawPaths(child, pxPerInch, 1, .01 * pxPerInch, error => console.log(error));
                if (!c.rawPaths)
                    continue;
                allPositions.push(c.rawPaths);
                c.translate = [0, 0, 0];
                c.scale = [1, 1, 1];
                c.fillColor = getColor(child.style.fill);
                c.strokeColor = getColor(child.style.stroke);
            } else if (child.nodeName !== 'g')
                continue;
            state.push(c);
            parent.children.push(c.id);
            addChildren(c, child)
        }
    }

    let doc = {
        id: uuid.v4(),
        type: 'document',
        name: file.name,
        isRoot: true,
        children: [],
        selected: false,
    };
    state.push(doc);
    addChildren(doc, svg);
    let viewBox = svg.viewBox.baseVal;
    flipY(allPositions, (viewBox.y + viewBox.height) / pxPerInch * 25.4);
    return state;
}

function loadImage(state, {file, content}) {
    let doc = {
        id: uuid.v4(),
        type: 'image',
        name: file.name,
        isRoot: true,
        children: [],
        selected: false,
        translate: [0, 0, 0],
        scale: [1, 1, 1],
        mimeType: file.type,
        dataURL: content,
        dpi: 96, // TODO
    };
    state.push(doc);
    return state;
}

export function documentsLoad(state, settings, action) {
    if (action.payload.file.type === 'image/svg+xml')
        return loadSvg(state, settings, action.payload);
    else if (action.payload.file.type.substring(0, 6) === 'image/')
        return loadImage(state, action.payload);
    else {
        // TODO: show error in gui
        console.log('Unsupported file type:', action.payload.file.type)
        return state;
    }
}

export function documents(state, action) {
    state = documentsForest(state, action);
    switch (action.type) {
        case 'DOCUMENT_SELECT': {
            let ids = getSubtreeIds(state, action.payload.id);
            return state.map(o => Object.assign({}, o, { selected: ids.includes(o.id) }));
        }
        case 'DOCUMENT_TOGGLE_SELECT': {
            let parent = state.find(o => o.id === action.payload.id);
            if (!parent)
                return state;
            let selected = !parent.selected;
            state = reduceSubtree(state, action.payload.id, true, o => Object.assign({}, o, { selected }));
            if (!selected)
                state = reduceParents(state, action.payload.id, false, o => Object.assign({}, o, { selected: false }));
            return state;
        }
        default:
            return state;
    }
}
