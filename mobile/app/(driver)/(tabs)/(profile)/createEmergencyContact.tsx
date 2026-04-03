import SharedCreateEmergencyContact from "@/shared/screens/createEmergencyContact";
import { useLocalSearchParams } from "expo-router";

const CreateEmergencyContact = () => {
  const params = useLocalSearchParams();
  return <SharedCreateEmergencyContact params={params} />;
};

export default CreateEmergencyContact;

