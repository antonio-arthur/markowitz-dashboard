from rest_framework import serializers


class AnaliseCarteiraSerializer(serializers.Serializer):
    tickers = serializers.ListField(
        child=serializers.CharField(max_length=20),
        min_length=2,
        max_length=15,
        required=True,
    )
    periodo = serializers.ChoiceField(
        choices=[
            '1mo',
            '3mo',
            '6mo',
            '1y'
            
        ],
        default='1y',
        required=False,
    )
    perfil = serializers.ChoiceField(
        choices=['conservador', 'moderado', 'arrojado'],
        default='moderado',
        required=False,
    )
