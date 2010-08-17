/*jslint white: true, browser: true, onevar: true, undef: true, nomen: true, eqeqeq: true, regexp: true, newcap: true, immed: true */
/*global Components,content,window*/
var rtlzr = {
    prefs: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch),
    newLine: (Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).OS === 'WINNT' ? '\r\n' : '\n'),
    
    printDirection: function () {
        document.getElementById('rtlzr-statusbar-text').value = rtlzr.direction.toUpperCase();
    },

    toggleDir: function () {
        rtlzr.direction = (rtlzr.direction === 'ltr' ? 'rtl' : 'ltr');
        rtlzr.printDirection();
    },

    onPageLoad: function (e) {
        var target = e.originalTarget;
        if (target.nodeName === '#document' && target.documentURI === content.location.href) {
            rtlzr.direction = content.getComputedStyle(target.body, null).direction ||      // try body tag first
                content.getComputedStyle(target.body.parentNode, null).direction ||         // then html tag 
                content.getComputedStyle(target.body.firstChild, null).direction || 'ltr';  // then wrapping div inside body. fallback: ltr (default)
            rtlzr.printDirection();
            if (rtlzr.autoToggle) {
                rtlzr.toggleDirection({button: 0});
            }
        }
    },

    load: function (e) {
        var appcontent = document.getElementById('appcontent');
        if (appcontent) {
            appcontent.addEventListener('DOMContentLoaded', rtlzr.onPageLoad, true);
        }
        rtlzr.autoToggle = rtlzr.prefs.getBoolPref('extensions.rtlzr.autoToggleDirection');
        document.getElementById('rtlzr-menuitem-autotoggle').setAttribute('checked', rtlzr.autoToggle);
    },

    rgbToHex: function (m, d1, d2, d3) {
        d1 = (d1 < 16 ? '0' : '') + parseInt(d1, 10).toString(16);
        d2 = (d2 < 16 ? '0' : '') + parseInt(d2, 10).toString(16);
        d3 = (d3 < 16 ? '0' : '') + parseInt(d3, 10).toString(16);
        return '#' + d1 + d2 + d3;
    },

    setStyle: function (style) {
        var temp,
            changeKeys = {},
            changes = [],
            rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, // rgb (255, 255, 255) 

            addChange = function (value) {
                if (!changeKeys[value]) {
                    changeKeys[value] = 1;
                    changes[changes.length] = value;
                }
            },

            swap = function (prop1, prop2, reset, name1, name2) {
                var temp,
                    value1 = style[prop1],
                    value2 = style[prop2];

                if (value1 === value2 ||
                    (reset !== 'auto' && !parseInt(value1, 10) && !parseInt(value2, 10)) ||
                    (reset === 'auto' && (value1 === 'auto' || !value1) && (value2 === 'auto' || !value2))) {
                    return;
                }

                temp = value2;
                style[prop2] = (value1 || reset);
                style[prop1] = (temp || reset);

                if (reset === 'auto') {
                    value1 = (parseInt(style[prop1], 10) === 0 ? 0 : style[prop1]);
                    value2 = (parseInt(style[prop2], 10) === 0 ? 0 : style[prop2]);
                } else {
                    value1 = (!parseInt(style[prop1], 10) ? reset : style[prop1]);
                    value2 = (!parseInt(style[prop2], 10) ? reset : style[prop2]);
                }

                // for borders replace rbg to hex values
                if (reset === 'none') {
                    value1 = value1.replace(rgb, rtlzr.rgbToHex);
                    value2 = value2.replace(rgb, rtlzr.rgbToHex);
                }
                addChange(name1 + ': ' + value1);
                addChange(name2 + ': ' + value2);
            },
            
            changeDir = function (prop, name) {
                var value = style[prop];
                if (value === 'left' || value === 'right') {
                    style[prop] = value = (value === 'right' ? 'left' : 'right');
                    addChange(name + ': ' + value);
                }
            };

        if (style) {
            // edge case
            if (style.position === 'absolute' && rtlzr.fixHiddenAbsoluteElements) {
                temp = parseInt(style.left || 0, 10);
                if (Math.abs(temp) > 2000) {
                    if (temp < 0) {
                        style.top = style.left;
                        addChange('top: ' + style.top);
                    } else {
                        style.bottom = style.left;
                        addChange('bottom: ' + style.bottom);
                    }
                    style.left = 'auto';
                    addChange('left: auto');
                }
                temp = parseInt(style.right || 0, 10);
                if (Math.abs(temp) > 2000) {
                    if (temp < 0) {
                        style.top = style.right;
                        addChange('top: ' + style.top);
                    } else {
                        style.bottom = style.right;
                        addChange('bottom: ' + style.bottom);
                    }
                    style.right = 'auto';
                    addChange('right: auto');
                }
            }

            // normal cases
            changeDir('cssFloat', 'float');
            changeDir('textAlign', 'text-align');
            changeDir('clear', 'clear');
            swap('left', 'right', 'auto', 'left', 'right');
            swap('marginLeft', 'marginRight', '0', 'margin-left', 'margin-right');
            swap('paddingLeft', 'paddingRight', '0', 'padding-left', 'padding-right');
            swap('borderLeft', 'borderRight', 'none', 'border-left', 'border-right');

            // edge cases
            if (rtlzr.forceDisplayInlineFloat && style.display === 'inline' && !style.cssFloat) {
                style.cssFloat = (rtlzr.direction === 'rtl' ? 'right' : 'left');
                addChange('float: ' + style.cssFloat);
            }
            if (style.overflow === 'hidden' && rtlzr.removeTextDecoration && Math.abs(parseInt(style.textIndent || 0, 10)) > 1000) {
                style.textDecoration = 'none';
                addChange('text-decoration: none');
            }

            // direction
            if (style.direction) {
                style.direction = rtlzr.direction;
                addChange('direction: ' + style.direction);
            }
        }

        return (changes.length ? ' { ' + changes.join('; ') + '; }' : false);
    },

    createSelector: function (el) {
        var i = 1,
            aux = el,
            path = [];

        if (el.id) {
            return '#' + el.id;
        }

        if (el.localName === 'body') {
            return 'body';
        }

        while (aux !== el.parentNode.firstChild) {
            i += 1;
            aux = aux.previousSibling;
        }

        path[0] = ':nth-child(' + i + ')';
        
        (function (ele) {
            var node = ele.parentNode,
                name = node && node.localName;

            if (node.id) {
                path[path.length] = '#' + node.id;
                return;
            }

            if (name) {
                path[path.length] = name;
                arguments.callee(node);
            }
        }(el));

        return path.reverse().join(' ');
    },

    getString: function (key) {
        return document.getElementById('rtlzr-strings').getString(key);
    },

    getFormattedString: function (key, params) {
        return document.getElementById('rtlzr-strings').getFormattedString(key, params);
    },

    processInlineStyles: function (wnd) {
        var changes, el, locationPrinted, style,
            all = wnd.document.getElementsByTagName('*'),
            i = all.length,
            upper = i - 1;

        while (i--) {
            el = all[upper - i];
            style = el.style;
            if (el.dir) {
                style.direction = el.dir;
            }
            changes = rtlzr.setStyle(style);
            if (changes) {
                if (!locationPrinted) {
                    locationPrinted = true;
                    rtlzr.inlineChanges[rtlzr.inlineChanges.length] = rtlzr.newLine + '/* ' + wnd.location.href + ' */' + rtlzr.newLine;
                }
                rtlzr.inlineChanges[rtlzr.inlineChanges.length] = rtlzr.createSelector(el) + changes;
            }
        }
    },
   
    processInternalExternalStyles: function (wnd) {
        var locationPrinted,
            internalBlockCount = 1,
            styles = wnd.document.styleSheets,
            i = styles.length,
            upperI = i - 1,
            
            rec = function (styleSheet, isImport) {
                var changes, comment, currentStyleSheet, rule, style,
                rules = styleSheet.cssRules,
                j = rules.length,
                upperJ = j - 1;

                while (j--) {
                    rule = rules[upperJ - j];

                    if (rule.type === 3 && rtlzr.flipImport) {
                        rec(rule.styleSheet, true);
                    } else {
                        style = rule.style;
                        changes = rtlzr.setStyle(style);
                        if (changes) {
                            if (!locationPrinted) {
                                locationPrinted = true;
                                rtlzr.cssChanges[rtlzr.cssChanges.length] = (rtlzr.cssChanges.length ? rtlzr.newLine : '') + '/* ' + wnd.location.href + ' */';
                            }
                            if (currentStyleSheet !== i) {
                                currentStyleSheet = i;
                                comment = (isImport ? '[@import] ' : '') + (styleSheet.href ? rtlzr.getFormattedString('externalStyleFile', [styleSheet.href]) : rtlzr.getFormattedString('internalStyleBlock', [internalBlockCount++]));
                                rtlzr.cssChanges[rtlzr.cssChanges.length] = rtlzr.newLine + '/* ' + comment + ' */' + rtlzr.newLine;
                            }
                            rtlzr.cssChanges[rtlzr.cssChanges.length] = rule.selectorText + changes;
                        }
                    }
                }
            };

        while (i--) {
            rec(styles[upperI - i]);
        }
    },

    processWindow: function (wnd) {
        var frames = wnd.frames,
            i = frames.length,
            upper = i - 1;

        // page direction
        wnd.document.body.style.direction = rtlzr.direction;

        // process styles adding file location as comment when changes occur
        rtlzr.processInlineStyles(wnd);
        rtlzr.processInternalExternalStyles(wnd);

        // frames
        if (rtlzr.prefs.getBoolPref('extensions.rtlzr.flipFrames')) {
            while (i--) {
                rtlzr.processWindow(frames[upper - i]);
            }
        }
    },

    toggleDirection: function (e) {
        if (!(e && e.button === 0)) {
            return;
        }

        // set arrays and configs
        rtlzr.cssChanges = [];
        rtlzr.inlineChanges = [];
        rtlzr.toggleDir();
        rtlzr.forceDisplayInlineFloat = rtlzr.prefs.getBoolPref('extensions.rtlzr.forceDisplayInlineFloat');
        rtlzr.fixHiddenAbsoluteElements = rtlzr.prefs.getBoolPref('extensions.rtlzr.fixHiddenAbsoluteElements');
        rtlzr.removeTextDecoration = rtlzr.prefs.getBoolPref('extensions.rtlzr.removeTextDecoration');
        rtlzr.flipImport = rtlzr.prefs.getBoolPref('extensions.rtlzr.flipImport');

        // process window recursively looking for iframes/frames
        rtlzr.processWindow(content);
    },

    appendInlineStyles: function (css) {
        var i, upper;

        if (!rtlzr.prefs.getBoolPref('extensions.rtlzr.exportInlineStyles')) {
            return;
        }
        i = rtlzr.inlineChanges && rtlzr.inlineChanges.length;
        upper = i - 1;

        if (i) {
            css[css.length] = rtlzr.newLine + '/* ' + rtlzr.getString('inlineStyleComment') + ' */';
            while (i--) {
                css[css.length] = rtlzr.inlineChanges[upper - i].replace(/;/g, ' !important;');
            }
        }
    },

    writeFile: function (data) {
        var rv,
            nsIFilePicker = Components.interfaces.nsIFilePicker,
            foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream),
            converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].createInstance(Components.interfaces.nsIConverterOutputStream),
            fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

        fp.init(window, rtlzr.getString('SaveDialog'), nsIFilePicker.modeSave);
        fp.appendFilter(rtlzr.getString('CSSFilter'), '*.css');
        fp.appendFilters(nsIFilePicker.filterAll);
        rv = fp.show();
        if (rv === nsIFilePicker.returnOK || rv === nsIFilePicker.returnReplace) {
            foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0);
            try {
                converter.init(foStream, "UTF-8", 0, 0);
                converter.writeString(data);
            } finally {
                converter.close();
            }
        }
    },

    exportCSSChanges: function () {
        var css = rtlzr.cssChanges || [];
        
        rtlzr.appendInlineStyles(css);
        rtlzr.writeFile(css.join(rtlzr.newLine));
    },

    showPreferences: function () {
        window.openDialog('chrome://rtlzr/content/preferences.xul', 'rtlzr-prefs', 'chrome,centerscreen,resizable').focus();
    },

    setAutoToggle: function () {
        rtlzr.autoToggle = !rtlzr.autoToggle;
        rtlzr.prefs.setBoolPref('extensions.rtlzr.autoToggleDirection', rtlzr.autoToggle);
    }
};

window.addEventListener('load', function (e) {
    rtlzr.load(e);
}, false);
