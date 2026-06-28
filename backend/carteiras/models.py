from django.db import models

class Ativo(models.Model):
    ticker = models.CharField(max_length=10, unique=True)
    nome = models.CharField(max_length=100)
    setor = models.CharField(max_length=50, blank=True, null=True)
    
    def __str__(self):
        return self.ticker

class Carteira(models.Model):
    nome = models.CharField(max_length=100)
    data_criacao = models.DateTimeField(auto_now_add=True)
    ativos = models.ManyToManyField(Ativo, through='CarteiraAtivo')
    
    def __str__(self):
        return self.nome

class CarteiraAtivo(models.Model):
    carteira = models.ForeignKey(Carteira, on_delete=models.CASCADE)
    ativo = models.ForeignKey(Ativo, on_delete=models.CASCADE)
    peso = models.DecimalField(max_digits=5, decimal_places=4)
    
    class Meta:
        unique_together = ['carteira', 'ativo']
