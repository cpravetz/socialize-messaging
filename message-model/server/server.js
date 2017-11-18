import { ParticipantsCollection } from '../../participant-model/common/participant-model.js';
import { ConversationsCollection } from '../../conversation-model/common/conversation-model.js';
import { MessagesCollection } from '../common/message-model.js';

MessagesCollection.allow({
    // If the user is a participant, allow them to insert (send) a message
    insert(userId, message) {
        if (userId && ParticipantsCollection.findOne({ userId, conversationId: message.conversationId })) {
            return true;
        }
        return false;
    },
    // If the user sent the message, let them modify it.
    update(userId, message) {
        return userId && message.checkOwnership();
    },
});

// After a message is sent we need to update the ParticipantsCollection and ConversationsCollection
MessagesCollection.after.insert(function afterInsert(userId, document) {
    // Grab the current time
    const date = new Date();

    /* Only update participants who aren't observing the conversation.
     * If we update users who are reading the conversation it will show the
     * conversation as unread to the user. This would be bad UX design
     *
     * Tracking observations is done throught the "viewingConversation" subscription
    */
    ParticipantsCollection.update({
        conversationId: document.conversationId,
        observing: {
            $size: 0,
        },
        read: true,
    }, {
        $set: { read: false },
    }, {
        multi: true,
        namespace: `conversation::${document.conversationId}`,
    });

    ParticipantsCollection.update({ userId }, { $set: { date } });

    // update the date on the conversation for sorting the conversation from newest to oldest
    ConversationsCollection.update(document.conversationId, { $set: { date } });
});
