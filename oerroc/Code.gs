// Gmail Cards - Server functions

function doGet() {
  var template = HtmlService.createTemplateFromFile('index');
  template.cards = JSON.stringify(getCards());
  return template.evaluate()
    .setTitle('Gmail Cards')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Cards CRUD

function getCards() {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty('cards');
  if (!raw) return [];
  return JSON.parse(raw);
}

function saveCards(cards) {
  var props = PropertiesService.getUserProperties();
  props.setProperty('cards', JSON.stringify(cards));
  return cards;
}

function addCard(data) {
  var cards = getCards();
  var card = {
    id: Utilities.getUuid(),
    friendlyName: data.friendlyName || 'New Card',
    query: data.query || '',
    groupBy: data.groupBy || 'date',
    collapsed: false,
    order: cards.length
  };
  cards.push(card);
  saveCards(cards);
  return card;
}

function updateCard(cardId, fields) {
  var cards = getCards();
  var idx = cards.findIndex(function(c) { return c.id === cardId; });
  if (idx === -1) throw new Error('Card not found');
  for (var key in fields) {
    if (fields.hasOwnProperty(key)) {
      cards[idx][key] = fields[key];
    }
  }
  saveCards(cards);
  return cards[idx];
}

function deleteCard(cardId) {
  var cards = getCards();
  cards = cards.filter(function(c) { return c.id !== cardId; });
  // Reorder
  cards.forEach(function(c, i) { c.order = i; });
  saveCards(cards);
  return cards;
}

function reorderCards(orderedIds) {
  var cards = getCards();
  var map = {};
  cards.forEach(function(c) { map[c.id] = c; });
  var reordered = orderedIds.map(function(id, i) {
    var c = map[id];
    if (c) c.order = i;
    return c;
  }).filter(Boolean);
  saveCards(reordered);
  return reordered;
}

// Gmail thread fetching

// Preview query results (without saving)
function previewQuery(query, groupBy) {
  if (!query || !query.trim()) return { groups: [], nextStart: 0, hasMore: false };

  groupBy = groupBy || 'date';
  var max = 10;
  var threads = GmailApp.search(query, 0, max);
  var tz = Session.getScriptTimeZone() || 'America/Argentina/Cordoba';

  var result = threads.map(function(t) {
    var msgs = t.getMessages();
    var lastMsg = msgs[msgs.length - 1];
    var sender = extractSender(lastMsg);
    return {
      threadId: t.getId(),
      subject: t.getFirstMessageSubject() || '(no subject)',
      snippet: lastMsg.getPlainBody().slice(0, 100).replace(/\s+/g, ' '),
      lastMsgDate: lastMsg.getDate().toISOString(),
      unread: t.isUnread() ? 1 : 0,
      sender: sender
    };
  });

  var groups = groupThreads(result, groupBy, tz);
  return { groups: groups, count: threads.length };
}

function fetchThreadsForCard(cardId, startIndex) {
  var cards = getCards();
  var card = cards.find(function(c) { return c.id === cardId; });
  if (!card) throw new Error('Card not found');

  var query = card.query;
  var groupBy = card.groupBy || 'date';
  var max = 20;
  var start = startIndex || 0;
  var threads = GmailApp.search(query, start, max);
  var tz = Session.getScriptTimeZone() || 'America/Argentina/Cordoba';

  var result = threads.map(function(t) {
    var msgs = t.getMessages();
    var lastMsg = msgs[msgs.length - 1];
    var participants = extractParticipants(msgs);
    var sender = extractSender(lastMsg);
    return {
      threadId: t.getId(),
      subject: t.getFirstMessageSubject() || '(no subject)',
      snippet: lastMsg.getPlainBody().slice(0, 200).replace(/\s+/g, ' '),
      lastMsgDate: lastMsg.getDate().toISOString(),
      unread: t.isUnread() ? 1 : 0,
      participants: participants,
      sender: sender
    };
  });

  var groups = groupThreads(result, groupBy, tz);

  return {
    groups: groups,
    nextStart: start + result.length,
    hasMore: result.length === max
  };
}

function extractSender(msg) {
  var from = msg.getFrom();
  var match = from.match(/^([^<]+)/);
  return match ? match[1].trim() : from;
}

function extractParticipants(msgs) {
  var seen = {};
  var list = [];
  msgs.forEach(function(m) {
    var from = m.getFrom();
    // Extract name or email
    var match = from.match(/^([^<]+)/);
    var name = match ? match[1].trim() : from;
    if (!seen[name]) {
      seen[name] = true;
      list.push(name);
    }
  });
  return list.slice(0, 3).join(', ');
}

function groupByDate(threads, tz) {
  var buckets = {
    'Today': [],
    'Yesterday': [],
    'This week': [],
    'Last 30 days': [],
    'Older': []
  };

  threads.forEach(function(t) {
    var label = friendlyDateLabel(new Date(t.lastMsgDate), tz);
    buckets[label].push(t);
  });

  // Return as array, filtering empty
  var order = ['Today', 'Yesterday', 'This week', 'Last 30 days', 'Older'];
  return order.map(function(label) {
    return { label: label, threads: buckets[label] };
  }).filter(function(g) { return g.threads.length > 0; });
}

function groupBySender(threads) {
  var buckets = {};
  var order = [];

  threads.forEach(function(t) {
    var sender = t.sender || 'Unknown';
    if (!buckets[sender]) {
      buckets[sender] = [];
      order.push(sender);
    }
    buckets[sender].push(t);
  });

  return order.map(function(sender) {
    return { label: sender, threads: buckets[sender] };
  });
}

function groupThreads(threads, groupBy, tz) {
  if (groupBy === 'sender') {
    return groupBySender(threads);
  }
  return groupByDate(threads, tz);
}

function friendlyDateLabel(date, tz) {
  var now = new Date();
  var nowStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var dStr = Utilities.formatDate(date, tz, 'yyyy-MM-dd');

  if (dStr === nowStr) return 'Today';

  var yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dStr === Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd')) return 'Yesterday';

  // Start of week (Monday)
  var dayOfWeek = parseInt(Utilities.formatDate(now, tz, 'u'), 10);
  var dayIndex = dayOfWeek - 1; // Monday=0
  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayIndex);
  var weekStartStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');
  if (dStr >= weekStartStr) return 'This week';

  var daysDiff = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (daysDiff <= 30) return 'Last 30 days';

  return 'Older';
}

// URL for opening thread in Gmail popout
function getThreadUrl(threadId) {
  var encoded = encodeURIComponent('#thread-f:' + threadId);
  return 'https://mail.google.com/mail/u/0/popout?search=inbox&type=' + encoded + '&th=' + encoded;
}

// Thread actions
function archiveThread(threadId) {
  var thread = GmailApp.getThreadById(threadId);
  if (thread) thread.moveToArchive();
  return { success: true };
}

function starThread(threadId, star) {
  var thread = GmailApp.getThreadById(threadId);
  if (thread) {
    if (star) {
      thread.getMessages().forEach(function(m) { m.star(); });
    } else {
      thread.getMessages().forEach(function(m) { m.unstar(); });
    }
  }
  return { success: true };
}

function markThreadRead(threadId, read) {
  var thread = GmailApp.getThreadById(threadId);
  if (thread) {
    if (read) {
      thread.markRead();
    } else {
      thread.markUnread();
    }
  }
  return { success: true };
}

function toggleImportant(threadId) {
  var thread = GmailApp.getThreadById(threadId);
  if (thread) {
    if (thread.isImportant()) {
      thread.markUnimportant();
    } else {
      thread.markImportant();
    }
  }
  return { success: true };
}

function trashThread(threadId) {
  var thread = GmailApp.getThreadById(threadId);
  if (thread) thread.moveToTrash();
  return { success: true };
}

// Get recent recipients from sent mail
function getRecentRecipients(limit) {
  limit = limit || 8;
  var threads = GmailApp.search('in:sent', 0, 30);
  var seen = {};
  var recipients = [];

  for (var i = 0; i < threads.length && recipients.length < limit; i++) {
    var msgs = threads[i].getMessages();
    for (var j = msgs.length - 1; j >= 0 && recipients.length < limit; j--) {
      var msg = msgs[j];
      // Only sent messages
      if (msg.getFrom().indexOf(Session.getActiveUser().getEmail()) === -1) continue;

      var to = msg.getTo();
      var cc = msg.getCc();
      var all = (to + ',' + cc).split(',');

      for (var k = 0; k < all.length && recipients.length < limit; k++) {
        var raw = all[k].trim();
        if (!raw) continue;

        // Parse "Name <email>" or just "email"
        var match = raw.match(/^(?:([^<]+)\s*)?<?([^>]+@[^>]+)>?$/);
        if (!match) continue;

        var email = match[2].trim().toLowerCase();
        if (seen[email]) continue;
        seen[email] = true;

        var name = match[1] ? match[1].trim() : email.split('@')[0];
        recipients.push({ name: name, email: email });
      }
    }
  }

  return recipients;
}
