/**
 * This class manages the Clackity widget, which is less complex and glamourous
 * than it sounds.
 *
 * @param {!string} editorID The ID of the editor element on the page.
 * @constructor
 */
var Clackity = function(editorSelector) {
  // Grab the textarea, and replace it in the DOM with a nice, meaningless div.
  this.textarea_ = document.querySelector(editorSelector);
  this.editor_ = document.createElement('div');
  this.editor_.classList.add('clackity');
  this.textarea_.parentNode.replaceChild(this.editor_, this.textarea_);

  // Setup event listeners.
  this.editor_.addEventListener('keydown', this.preprocessKeystroke_.bind(this));
  this.editor_.addEventListener('keyup', this.setNeedsUpdate_.bind(this));

  // Kick things off by focusing on the editor and running a style update.
  this.editor_.focus();
  this.update();
};

Clackity.prototype = {
  /**
   * Cached reference to the editor's DOM element.
   *
   * @type {DOMElement}
   * @private
   */
  editor_: null,

  onclose: function () {},
  onpersist: function () {},

  set value(text) {
    this.textarea_.value = text;
    this.editor_.innerText = text;
    this.update();
  },

  get value() {
    return this.editor_.innerText;
  },

  setNeedsUpdate_: function (e) {
    if (e.keyCode === 16 || // Shift
        e.keyCode === 17 || // Ctrl
        e.keyCode === 18 || // Alt
        e.keyCode === 91 || // Command
        e.keyCode === 93 || // Other command.
        (e.keyCode >= 37 && e.keyCode <= 40)) // Arrow keys
      return;
    if (e.keyCode === 27) // Esc
      return this.onclose();

    if (!this.needsUpdate_) {
      this.needsUpdate_ = true;
      window.requestAnimationFrame(this.update.bind(this));
    }
  },

  /**
   * One or two characters cause issues; this function triggers on `keydown`
   * in order to work around them.
   *
   * @param {!KeyboardEvent} e The keyboard event that we're responding to.
   */
  preprocessKeystroke_: function (e) {
    if (e.keyCode === 83 && e.metaKey) { // command-s
      e.preventDefault();
      e.stopPropagation();
      this.onpersist(this.editor_.innerText, true);
      return;
    }
    if (e.keyCode === 8) { // BACKSPACE
      if (window.getSelection) {
        var selection = window.getSelection();
        var range = selection.getRangeAt(0);
        // Don't delete our way out of the root element.
        if (!range.endOffset && !range.startOffset &&
            range.startContainer === this.editor_.firstChild.firstChild) {
          e.preventDefault();
          e.stopPropagation();
        }
        // Don't get stuck on the cursor.
        if (range.startContainer.id === 'caretmarker') {
          range.setStartBefore(range.startContainer);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      return;
    }
    if (e.keyCode === 9) { // TAB
      e.preventDefault();
      e.stopPropagation();
      if (window.getSelection) {
        var selection = window.getSelection();
        var range = selection.getRangeAt(0);
        range.insertNode(document.createTextNode('  '));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    if (e.keyCode === 13) { // ENTER
      e.preventDefault();
      e.stopPropagation();
      if (window.getSelection) {
        var selection = window.getSelection();
        var range = selection.getRangeAt(0);
        range.insertNode(document.createTextNode('\n'));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  },

  /**
   * Run the update process for the editor. The expectation is that this method
   * will execute after `keyup` to process the text as it currently exists. At
   * the moment, it's incredibly inefficient. If that becomes a problem, I'll
   * rework it, but since this is more or less optimized for ~500 word strings,
   * I'm not terribly worried about performance.
   *
   * @param {!KeyboardEvent} e The keyboard event that we're responding to.
   */
  update: function (e) {
    this.needsUpdate_ = false;

    this.saveCaret_();
    this.editor_.innerHTML = this.processText_(this.value);
    this.resetCaret_();
  },

  /**
   * Given a string formatted with some reasonable subset of Markdown, do some
   * light processing work to convert into HTML for pretty rendering.
   *
   * @return {String} The processed text (in HTML format).
   * @private
   */
  processText_: function (text) {
    // Things are simpler if text ends with a newline.
    if (text.match(/\S$/))
      text += "\n";
    var replacement = [
      // & and < and > => &amp; and &lt; and &gt;
      [/\&/gi, '&amp;'],
      [/\</gi, '&lt;'],
      [/\>/gi, '&gt;'],

      // Caret replacement.
      [/{{ CARETBEGIN }}/, '<mark id="caretmarker">'],
      [/{{ CARETEND }}/, '</mark>'],

      // _italic_ => <em>_italic_</em>
      [/(^|[\s\[])_([^_\s]+(?:(?:_[^_\s]+)*))_(?=$|[\s\.;:<,\]])/gi, '$1<em><s>&#x5f;</s>$2<s>&#x5f;</s></em>'],
      [/(^|[\s\[])_(.+?)_(?=$|[\s\.;:<,\]])/gi, '$1<em><s>&#x5f;</s>$2<s>&#x5f;</s></em>'],

      // **bold** => <strong>bold</strong>
      [/(^|[\s\[])\*\*([^\*\s]+(?:(?:\*\*[^*\s]+)*))\*\*(?=$|[\s\.;:<,\]])/gi, '$1<strong><s>&#x2a;&#x2a;</s>$2<s>&#x2a;&#x2a;</s></strong>'],
      [/(^|[\s\[])\*\*(.+?)\*\*(?=$|[\s\.;:<,\]])/gi, '$1<strong><s>&#x2a;&#x2a;</s>$2<s>&#x2a;&#x2a;</s></strong>'],

      // `code` => <code>`code`</code>
      [/(^|[\s\[])`([^\`]+?)`(?=$|[\s\.;:<,\]])/gi, '$1<code><s>&#x60;</s>$2<s>&#x60;</s></code>'],

      // # Header => # <strong>Header</strong>
      [/(^|\n)(#+\s+)([^\n]+)/gi, '$1$2<strong class=\'hx\'>$3</strong>'],

      // [link](omg) => [<a href="omg">link</a>](omg)
      [/\[([^\]]+)\]\(([^ \)]+)\)/gi, '<s>&#x5b;</s><a href=\'$2\'>$1</a><s>&#x5d;&#x28;$2&#x29;</s>'],

      // [link][omg] => [<a href="#omg">link</a>][omg]
      [/\[([^\]]+)\]\[([^ \]]+)\]/gi, '<s>&#x5b;</s><a href=\'#$2\'>$1</a><s>&#x5d;&#x5b;$2&#x5d;</s>'],

      // ^[slug]: url => [slug]: <a href="url">url</a>
      [/(^|\n)\[([^ \]]+)\]: ([^\s<]+)/gi, '$1<s>&#x5b;$2&#x5d;:</s> <a href="$3" class="referent">$3</a>'],

      // Leading whitespace === teh awesome!
      //[/\n/g, '<br>'],
    ];
    for (var i = 0; i < replacement.length; i++)
      text = text.replace(replacement[i][0], replacement[i][1]);
    return '<pre>' + text + '</pre>';
  },

  /**
   * Save the caret position by inserting `{{ CARETBEGIN }}{{ CARETEND }}`.
   *
   * @private
   */
  saveCaret_: function () {
    // If we're not focused, focus.
    this.editor_.focus();
    if (window.getSelection) {
      var selection = window.getSelection();
      var range = selection.getRangeAt(0);
      range.insertNode(document.createTextNode('{{ CARETBEGIN }}{{ CARETEND }}'));
    }
  },

  /**
   * Given a document that contains a `#caretmarker`, remove that element and
   * set the caret to it's previous position.
   *
   * @private
   */
  resetCaret_: function () {
    var caret = document.querySelector('#caretmarker');
    var range = document.createRange();
    range.setStartBefore(caret);
    range.setEndAfter(caret);
    range.deleteContents();
    range.collapse(false);

    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  },
}
