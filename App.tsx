import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
  TextInput,
  Modal,
  Button
} from 'react-native';
import {
  Chat,
  Channel,
  MessageList,
  MessageInput,
  ChannelList,
  OverlayProvider,
  useChatContext,
  useChannelContext,
  MessageAction,
} from 'stream-chat-react-native';
import {
  StreamChat,
  Channel as StreamChannel,
  User as StreamUser,
} from 'stream-chat';
import {
  initializeApp,
} from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const STREAM_API_KEY: string = '4umujg35b2ks';

// You will now get the user token from your backend, so we don't need a placeholder here.
const STREAM_USER_TOKEN: string = '';

// Firebase configuration using global variables
const firebaseConfig = typeof __firebase_config !== 'undefined' ?
  JSON.parse(__firebase_config) :
  {};
const appId = typeof __app_id !== 'undefined' ?
  __app_id :
  'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ?
  __initial_auth_token :
  null;

const adminUser = {
  id: 'moderator-user',
  name: 'Moderator',
  image: `https://placehold.co/100x100/A855F7/FFFFFF?text=M`
};

const regularUser = {
  id: 'gaming-user',
  name: 'Gaming User',
  image: `https://placehold.co/100x100/3B82F6/FFFFFF?text=G`
};

const userRole = 'admin'; // Can be 'admin' or 'user'
const currentUser = userRole === 'admin' ? adminUser : regularUser;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const chatClient = StreamChat.getInstance(STREAM_API_KEY);

const App: React.FC = () => {
  const [isChatReady, setIsChatReady] = useState(false);
  const [activeChannel, setActiveChannel] = useState<StreamChannel | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [userToBan, setUserToBan] = useState<StreamUser | null>(null);

  const showMessageBox = (message: string) => {
    setErrorMessage(message);
    setModalVisible(true);
  };

  const fetchUserToken = async (userId: string) => {
    try {
      const response = await fetch('http://localhost:3000/stream-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (response.ok) {
        return data.token;
      } else {
        throw new Error(data.error || 'Failed to fetch token');
      }
    } catch (e: any) {
      console.error('Error fetching user token:', e);
      showMessageBox(`Error fetching token: ${e.message}`);
      return null;
    }
  };

  useEffect(() => {
    const setup = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, async (user) => {
          if (user) {
            console.log('Firebase user authenticated:', user.uid);

            const token = await fetchUserToken(currentUser.id);

            if (token && !chatClient.user) {
              await chatClient.connectUser(currentUser, token);

              
              const channel = chatClient.channel('messaging', 'gaming-group', {
                profanity_filter: 'profanity_en_2020_v1'
              });
              await channel.watch(); 
              setActiveChannel(channel); 
              
              setIsChatReady(true);
            }
          } else {
            console.log('Firebase user is not authenticated.');
          }
        });

      } catch (e: any) {
        console.error('An error occurred during setup:', e);
        showMessageBox(`Error initializing app: ${e.message}`);
      }
    };

    setup();

    return () => {
      if (chatClient.user) {
        chatClient.disconnectUser();
      }
    };
  }, []);

  const ModeratorActions: React.FC = () => {
    const { message } = useChannelContext();

    if (userRole === 'admin' && message?.user?.id !== currentUser.id) {
      return (
        <View style={styles.moderatorActionsContainer}>
          <TouchableOpacity
            style={styles.moderatorActionButton}
            onPress={() => {
              if (message?.id) {
                chatClient.flagMessage(message.id, `Flagged by moderator: ${currentUser.id}`);
                showMessageBox('Message has been flagged.');
              }
            }}
          >
            <Text style={styles.moderatorActionText}>Flag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moderatorActionButton}
            onPress={() => {
              if (message?.user) {
                setUserToBan(message.user as StreamUser);
                setModalVisible(true);
              }
            }}
          >
            <Text style={styles.moderatorActionText}>Ban</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  const BanUserModal: React.FC = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Ban User: {userToBan?.name}</Text>
          <TextInput
            style={styles.input}
            placeholder="Reason for ban"
            onChangeText={setBanReason}
            value={banReason}
          />
          <View style={styles.modalButtonContainer}>
            <Button
              title="Cancel"
              onPress={() => {
                setModalVisible(false);
                setBanReason('');
                setUserToBan(null);
              }}
            />
            <Button
              title="Confirm Ban"
              onPress={async () => {
                if (!userToBan) return;
                try {
                  await chatClient.banUser(userToBan.id, {
                    banned_by_id: currentUser.id,
                    reason: banReason,
                    expires: null,
                  });
                  showMessageBox(`${userToBan.name} has been banned.`);
                  setBanReason('');
                  setUserToBan(null);
                  setModalVisible(false);
                } catch (error: any) {
                  console.error('Error banning user:', error);
                  showMessageBox(`Error banning user: ${error.message}`);
                }
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );

  if (errorMessage) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Button title="Close" onPress={() => setErrorMessage('')} />
      </View>
    );
  }

  if (!isChatReady) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Connecting to chat...</Text>
      </SafeAreaView>
    );
  }

  if (activeChannel) {
    return (
      <SafeAreaView style={styles.container}>
        <BanUserModal />
        <TouchableOpacity style={styles.backButton} onPress={() => setActiveChannel(null)}>
          <Text style={styles.backButtonText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Chat client={chatClient}>
          <Channel channel={activeChannel} MessageActions={ModeratorActions}>
            <View style={StyleSheet.absoluteFill}>
              <MessageList />
              <MessageInput />
            </View>
          </Channel>
        </Chat>
      </SafeAreaView>
    );
  }

  
  // return (
  //   <SafeAreaView style={styles.container}>
  //     <Chat client={chatClient}>
  //       <ChannelList
  //         onSelect={setActiveChannel}
  //         filters={{ members: { $in: [currentUser.id] } }}
  //         sort={{ last_message_at: -1 }}
  //         options={{ limit: 30 }}
  //         onChannelsLoaded={({ channels }) => {
  //           if (channels.length === 0) {
  //             const newChannel = chatClient.channel('messaging', 'gaming-group', {
  //               name: 'Gaming Group',
  //               members: [adminUser.id, regularUser.id],
  //               profanity_filter: 'profanity_en_2020_v1'
  //             });
  //             newChannel.create();
  //           }
  //         }}
  //         FlatList={({ channels, onSelect }) => (
  //           <FlatList
  //             data={channels}
  //             keyExtractor={(item) => item.id}
  //             renderItem={({ item }) => (
  //               <TouchableOpacity
  //                 style={styles.channelItem}
  //                 onPress={() => onSelect(item)}
  //               >
  //                 <Text style={styles.channelName}>{item.data.name}</Text>
  //                 <Text style={styles.lastMessage}>
  //                   {item.lastMessageText || 'No messages yet.'}
  //                 </Text>
  //               </TouchableOpacity>
  //             )}
  //           />
  //         )}
  //       />
  //     </Chat>
  //   </SafeAreaView>
  // );


  return <Text>Something went wrong.</Text>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#374151',
  },
  channelItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  channelName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  lastMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FEE2E2',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  backButton: {
    padding: 15,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  moderatorActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  moderatorActionButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  moderatorActionText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
});

export default App;
