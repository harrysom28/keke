import React, { memo, useCallback, useContext, useEffect, useState } from 'react';
import {
  FlatList,
  InteractionManager,
  View,
  Text,
  ScrollView,
  Image,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import tw from '@/lib/tailwind';
import { AppContext } from '@/app/context';
import { setRideData, setAppData } from '@/store/AppSlice';
import { useIsFocused } from '@react-navigation/native';
import { AuthState } from '@/store/AuthSlice';
import { fetchRecentPlacesCached, subscribeRecentPlaces } from '@/utils/recentPlacesCache';

interface HomeBottomSheetProps {
  onSearchPress?: () => void;
  onFindRidePress?: () => void;
  onBookRidePress?: () => void;
}

function HomeBottomSheet({ 
  onSearchPress,
  onFindRidePress,
  onBookRidePress,
}: HomeBottomSheetProps) {
  const { apiConfig } = useContext(AppContext);
  const isFocused = useIsFocused();
  const dispatch = useDispatch();
  const { user } = useSelector(AuthState);
  const [recentPlaces, setRecentPlaces] = useState<any[]>([]);
  const [showPromo, setShowPromo] = useState(true);

  useEffect(() => {
    if (!isFocused) return;

    const userId = String(user?.profile?.user_id ?? user?.profile?._id ?? '');
    if (!userId) return;

    const unsub = subscribeRecentPlaces((fresh) => {
      setRecentPlaces(fresh.slice(0, 3));
    });

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      fetchRecentPlacesCached(userId)
        .then((list) => setRecentPlaces(list.slice(0, 3)))
        .catch(() => {});
    });

    return () => {
      interactionTask.cancel();
      unsub();
    };
  }, [isFocused, user?.profile?.user_id, user?.profile?._id]);

  const handleLocationSelect = useCallback((place: any) => {
    const locationData = {
      place_id: place.place_id || null,
      name: place.name || '',
      formatted_address: place.address || place.name || '',
      lat: place.location?.latitude || place.lat,
      long: place.location?.longitude || place.long,
    };

    // Set as destination in Redux
    dispatch(setRideData({ destination: locationData }));
    
    // Open find ride flow
    if (onFindRidePress) {
      onFindRidePress();
    } else {
      dispatch(setAppData({ isBooking: true }));
      // Stay on current screen; search happens inline on Home
    }
  }, [dispatch, onFindRidePress]);

  const handleSearchPress = useCallback(() => {
    if (onSearchPress) {
      onSearchPress();
    }
  }, [onSearchPress]);


  return (
    <>
      <View
        style={tw.style(
          `absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px]`,
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 10,
            maxHeight: '60%',
            zIndex: 10,
          }
        )}
      >
        {/* Handle bar */}
        <View style={tw`items-center pt-2 pb-1`}>
          <View style={tw`w-12 h-1 bg-gray-300 rounded-full`} />
        </View>

        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`pb-20`}
          showsVerticalScrollIndicator={false}
        >
          {/* Promotional Offer */}
          {showPromo && (
            <View
              style={tw.style(
                `mx-4 mt-2 mb-4 p-3 bg-gray-100 rounded-lg flex-row items-center justify-between`
              )}
            >
              <View style={tw`flex-row items-center flex-1`}>
                <View
                  style={tw`w-10 h-10 bg-blue-500 rounded-full items-center justify-center mr-3`}
                >
                  <Ionicons name="pricetag-outline" size={20} color="white" />
                </View>
                <View style={tw`flex-1`}>
                  <Text
                    style={tw.style(`text-sm font-bold text-gray-800`, {
                      fontFamily: 'RobotoBold',
                    })}
                  >
                    10% off 5 rides
                  </Text>
                  <Text
                    style={tw.style(`text-xs text-gray-600`, {
                      fontFamily: 'RobotoRegular',
                    })}
                  >
                    View details
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowPromo(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          {/* Greeting */}
          <View style={tw`px-4 mb-3`}>
            <Text
              style={tw.style(`text-2xl font-bold text-gray-900`, {
                fontFamily: 'RobotoBold',
              })}
            >
              Let's go places.
            </Text>
          </View>

          {/* Search Input */}
          <TouchableOpacity
            onPress={handleSearchPress}
            style={tw.style(
              `mx-4 mb-4 px-4 py-4 bg-gray-100 rounded-xl flex-row items-center`,
              {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 2,
              }
            )}
          >
            <Ionicons name="search" size={20} color="#9B9B9B" style={tw`mr-3`} />
            <Text
              style={tw.style(`text-base text-gray-500 flex-1`, {
                fontFamily: 'RobotoRegular',
              })}
            >
              Where to?
            </Text>
          </TouchableOpacity>

          {/* Suggested/Recent Locations */}
          {recentPlaces.length > 0 && (
            <View style={tw`px-4`}>
              <FlatList
                data={recentPlaces}
                scrollEnabled={false}
                keyExtractor={(place: any, index: number) => place.place_id || `place-${index}`}
                removeClippedSubviews={true}
                maxToRenderPerBatch={4}
                windowSize={3}
                initialNumToRender={3}
                renderItem={({ item: place, index }) => (
                  <TouchableOpacity
                    onPress={() => handleLocationSelect(place)}
                    style={tw.style(
                      `flex-row items-center py-3`,
                      index < recentPlaces.length - 1 && 'border-b border-gray-100'
                    )}
                  >
                  <View style={tw`mr-3`}>
                    {place.name?.toLowerCase().includes('campus') ||
                    place.name?.toLowerCase().includes('university') ? (
                      <Ionicons
                        name="time-outline"
                        size={22}
                        color="#5A5A5A"
                      />
                    ) : place.name?.toLowerCase().includes('market') ? (
                      <Ionicons
                        name="bag-outline"
                        size={22}
                        color="#5A5A5A"
                      />
                    ) : (
                      <Ionicons
                        name="location-outline"
                        size={22}
                        color="#5A5A5A"
                      />
                    )}
                  </View>
                  <View style={tw`flex-1`}>
                    <Text
                      style={tw.style(`text-base text-gray-900 mb-1`, {
                        fontFamily: 'RobotoMedium',
                      })}
                      numberOfLines={1}
                    >
                      {place.name || 'Unknown location'}
                    </Text>
                    <Text
                      style={tw.style(`text-sm text-gray-500`, {
                        fontFamily: 'RobotoRegular',
                      })}
                      numberOfLines={1}
                    >
                      {place.address || place.formatted_address || 'No address'}
                    </Text>
                  </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Action Buttons */}
          <View style={tw`px-4 mt-4 mb-2 gap-y-2`}>
            <TouchableOpacity
              onPress={() => {
                if (onFindRidePress) {
                  onFindRidePress();
                } else {
                  dispatch(setAppData({ isBooking: true }));
                  setSearchModalVisible(true);
                }
              }}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-lg`}
            >
              <Image
                resizeMode="contain"
                source={require('@images/keke-svg.png')}
                style={tw`w-[24px] h-[24px]`}
              />
              <Text
                style={tw.style(`text-base text-white`, {
                  fontFamily: 'RobotoBold',
                })}
              >
                Find Ride
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (onBookRidePress) {
                  onBookRidePress();
                } else {
                  dispatch(setAppData({ isBooking: true }));
                  setSearchModalVisible(true);
                }
              }}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-gray-300 bg-white rounded-lg`}
            >
              <Image
                resizeMode="contain"
                source={require('@images/bike-svg.png')}
                style={tw`w-[22px] h-[22px]`}
              />
              <Text
                style={tw.style(`text-base text-gray-900`, {
                  fontFamily: 'RobotoBold',
                })}
              >
                Book a Ride
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>

    </>
  );
}

export default memo(HomeBottomSheet);
