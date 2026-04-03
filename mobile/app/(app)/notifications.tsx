import NotificationInbox from "@/components/NotificationInbox";
import { AuthState } from "@/store/AuthSlice";
import { useSelector } from "react-redux";

const NotificationsScreen = () => {
  const { user } = useSelector(AuthState);
  return <NotificationInbox userId={user?.profile?.user_id || ""} />;
};

export default NotificationsScreen;
