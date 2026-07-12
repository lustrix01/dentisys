import React from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth'; // assuming existing auth hook
import { Card } from '../../components/shared/Card/Card';
import { Avatar } from '../../components/shared/Avatar/Avatar'; // placeholder, assume exists
import { Heading } from '../../components/shared/Heading/Heading';
import { Text } from '../../components/shared/Text/Text';

interface WelcomeHeaderProps {}

export const WelcomeHeader: React.FC<WelcomeHeaderProps> = () => {
  const { faculty } = useAuth(); // returns logged‑in faculty info
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const formattedDate = format(now, 'PPP');

  if (!faculty) return null;

  return (
    <Card className="flex items-center gap-4 p-6">
      <Avatar src={faculty.profilePhotoUrl ?? '/assets/avatar_placeholder.png'} alt="Profile" size="lg" />
      <div>
        <Heading as="h2" size="lg">
          {greeting},
        </Heading>
        <Text className="font-medium text-xl">
          {faculty.firstName} {faculty.lastName}
        </Text>
        <Text className="text-gray-500">{faculty.department}</Text>
        <Text className="text-sm text-gray-400 mt-1">{formattedDate}</Text>
      </div>
    </Card>
  );
};

export default WelcomeHeader;
